'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS, parseCsv, sheetToRows, type ImportRow } from '@/lib/staff-input';
import {
  getImportLists, previewStaffImport, commitStaffImport, type PreviewRow, type ImportResult,
} from '@/actions/staff-import.actions';

interface StaffBulkUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hands the new logins to the page, which shows them in the login-details dialog. */
  onCreated: (result: ImportResult) => void;
}

function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** An Excel cell as text: dates as YYYY-MM-DD, formulas as their result. */
function cellText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) {
    // Excel dates carry no zone; read them in UTC so a birthday never shifts a day.
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  if (typeof value === 'object') {
    const v = value as { text?: unknown; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if (v.result !== undefined) return cellText(v.result);
    if (v.text !== undefined) return cellText(v.text);
    return '';
  }
  return String(value);
}

async function readSheet(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return parseCsv(await file.text());
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet('Staff') ?? wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= IMPORT_COLUMNS.length + 5; c++) cells.push(cellText(row.getCell(c).value).trim());
    if (cells.some(Boolean)) rows.push(cells);
  });
  return rows;
}

export function StaffBulkUpload({ open, onOpenChange, onCreated }: StaffBulkUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [sendEmails, setSendEmails] = useState(true);
  const [busy, setBusy] = useState<'template' | 'reading' | 'creating' | null>(null);

  const reset = () => {
    setFileName(null);
    setRows(null);
    setPreview(null);
    if (input.current) input.current.value = '';
  };

  const close = (next: boolean) => {
    if (busy === 'creating') return;
    if (!next) reset();
    onOpenChange(next);
  };

  const downloadTemplate = async () => {
    setBusy('template');
    try {
      const l = await getImportLists();
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Staff', { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: Math.max(16, c.header.length + 2) }));
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002078' } };

      // The lists the dropdowns read from, on their own sheet.
      const lists = wb.addWorksheet('Lists');
      const columns: [string, string[]][] = [
        ['Departments', l.departments], ['Roles', l.roles], ['Branches', l.branches], ['Gender', ['Male', 'Female', 'Other']],
      ];
      columns.forEach(([title, values], i) => {
        const col = lists.getColumn(i + 1);
        col.width = 28;
        lists.getCell(1, i + 1).value = title;
        lists.getCell(1, i + 1).font = { bold: true };
        values.forEach((v, j) => { lists.getCell(j + 2, i + 1).value = v; });
      });

      const letter = (n: number) => String.fromCharCode(64 + n);
      const listRange = (i: number, count: number) => `Lists!$${letter(i + 1)}$2:$${letter(i + 1)}$${Math.max(2, count + 1)}`;
      const dropdowns: [string, number, number][] = [
        ['department', 0, l.departments.length], ['role', 1, l.roles.length], ['branch', 2, l.branches.length], ['gender', 3, 3],
      ];
      for (let r = 2; r <= MAX_IMPORT_ROWS + 1; r++) {
        for (const [key, i, count] of dropdowns) {
          const colIndex = IMPORT_COLUMNS.findIndex((c) => c.key === key) + 1;
          ws.getCell(r, colIndex).dataValidation = {
            type: 'list', allowBlank: true, formulae: [listRange(i, count)],
            showErrorMessage: true, errorTitle: 'Pick from the list', error: 'Choose a value from the dropdown.',
          };
        }
        ws.getCell(r, IMPORT_COLUMNS.findIndex((c) => c.key === 'dateOfBirth') + 1).numFmt = 'yyyy-mm-dd';
      }

      download(await wb.xlsx.writeBuffer(), 'hylink-staff-upload-template.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not build the template');
    } finally {
      setBusy(null);
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy('reading');
    setPreview(null);
    try {
      const { rows: parsed, missing } = sheetToRows(await readSheet(file));
      if (missing.length) {
        toast.error(`The file is missing these columns: ${missing.join(', ')}. Start from the template.`);
        return reset();
      }
      setFileName(file.name);
      setRows(parsed);
      const result = await previewStaffImport(parsed);
      if (!result.success || !result.data) {
        toast.error(result.error ?? 'Could not check the file');
        return reset();
      }
      setPreview(result.data);
    } catch {
      toast.error('That file could not be read. Upload the template as .xlsx or .csv.');
      reset();
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    if (!rows) return;
    setBusy('creating');
    const result = await commitStaffImport(rows, { sendEmails });
    setBusy(null);
    if (!result.success || !result.data) return toast.error(result.error ?? 'The upload failed');
    toast.success(result.message);
    onCreated(result.data);
    reset();
    onOpenChange(false);
  };

  const ready = preview?.filter((r) => r.ready).length ?? 0;
  const problems = (preview?.length ?? 0) - ready;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk upload staff</DialogTitle>
          <DialogDescription>
            Create up to {MAX_IMPORT_ROWS} staff at once from a spreadsheet. Each gets an employee ID and a temporary password.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-4">
          <li className="rounded-2xl border p-4">
            <p className="font-medium">1. Download the template</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Department, role, branch and gender are dropdowns of the names in this system. Starred columns are required.
            </p>
            <Button variant="outline" className="mt-3" onClick={downloadTemplate} disabled={busy === 'template'}>
              {busy === 'template' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download template (.xlsx)
            </Button>
          </li>

          <li className="rounded-2xl border p-4">
            <p className="font-medium">2. Upload the filled file</p>
            <input
              ref={input}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy === 'reading' || busy === 'creating'}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-200 px-4 py-5 text-sm font-medium text-indigo-700 transition-colors hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-60 dark:border-indigo-500/30 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
            >
              {busy === 'reading' ? <Loader2 className="h-4 w-4 animate-spin" /> : fileName ? <FileSpreadsheet className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
              {busy === 'reading' ? 'Checking every row...' : fileName ? `${fileName} · choose another` : 'Choose .xlsx or .csv file'}
            </button>
          </li>

          {preview && (
            <li className="rounded-2xl border p-4">
              <p className="font-medium">3. Check and create</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />{ready} ready
                </span>
                {problems > 0 && (
                  <span className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                    <XCircle className="h-4 w-4" />{problems} need fixing (they will be skipped)
                  </span>
                )}
              </div>

              <div className="mt-3 max-h-72 overflow-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.map((r) => (
                      <tr key={r.line} className={r.ready ? '' : 'bg-rose-50/60 dark:bg-rose-500/5'}>
                        <td className="px-3 py-2 align-top tabular-nums text-muted-foreground">{r.line}</td>
                        <td className="px-3 py-2 align-top">
                          <p className="font-medium">{r.name}</p>
                          <p className="break-all text-xs text-muted-foreground">{r.email}</p>
                        </td>
                        <td className="px-3 py-2 align-top">
                          {r.ready ? (
                            <span className="text-emerald-700 dark:text-emerald-400">Ready</span>
                          ) : (
                            <ul className="space-y-0.5 text-rose-700 dark:text-rose-400">
                              {r.problems.map((p) => <li key={p}>{p}</li>)}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-muted/50 px-4 py-3">
                <span>
                  <span className="block text-sm font-medium">Email each person their login details</span>
                  <span className="block text-xs text-muted-foreground">You will also see every login on screen to copy or send.</span>
                </span>
                <Switch checked={sendEmails} onCheckedChange={setSendEmails} />
              </label>

              {problems > 0 && ready > 0 && (
                <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  Fix the skipped rows in the file and upload just those again afterwards.
                </p>
              )}
            </li>
          )}
        </ol>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={busy === 'creating'}>Cancel</Button>
          <Button onClick={create} disabled={!preview || ready === 0 || busy !== null}>
            {busy === 'creating' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {busy === 'creating' ? `Creating ${ready} staff...` : `Create ${ready} staff`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
