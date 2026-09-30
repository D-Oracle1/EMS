'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { KeyRound, Copy, Check, AlertTriangle, Loader2, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { issueLoginDetails, type IssuedLogin } from '@/actions/auth.actions';

export interface LoginCandidate {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  email: string;
  status: string;
  lastLoginAt?: string | Date | null;
  role?: { name: string } | null;
  branch?: { name: string } | null;
}

interface LoginDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Staff to choose from. Omit to show `results` only (e.g. after creating one). */
  staff?: LoginCandidate[];
  /** Details already issued elsewhere, shown straight away. */
  results?: IssuedLogin[] | null;
  /** The signed-in admin, who cannot reissue their own password here. */
  currentUserId: string;
}

const loginUrl = () => (typeof window === 'undefined' ? '' : `${window.location.origin}/login`);

/** One person's details as a message ready to paste into WhatsApp, SMS or email. */
function asMessage(r: IssuedLogin) {
  return [
    `Hello ${r.name.split(' ')[0]}, here are your Hylink EMS login details:`,
    `Login page: ${loginUrl()}`,
    `Email: ${r.email}`,
    `Temporary password: ${r.tempPassword}`,
    `You will be asked to set your own password when you first sign in.`,
  ].join('\n');
}

/** Every row as tab-separated values, which paste into Excel or Sheets as a table. */
function asSpreadsheet(rows: IssuedLogin[]) {
  const head = ['Name', 'Employee ID', 'Role', 'Branch', 'Email', 'Temporary password'];
  const body = rows.map((r) => [r.name, r.employeeId, r.role ?? '', r.branch ?? '', r.email, r.tempPassword]);
  return [head, ...body].map((cols) => cols.join('\t')).join('\n');
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
    return true;
  } catch {
    toast.error('Could not copy. Select the text and copy it manually.');
    return false;
  }
}

export function LoginDetailsDialog({
  open, onOpenChange, staff, results: initialResults, currentUserId,
}: LoginDetailsDialogProps) {
  const [results, setResults] = useState<IssuedLogin[] | null>(initialResults ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [onlyNew, setOnlyNew] = useState(true);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Everyone eligible: not the admin themselves, not terminated.
  const eligible = useMemo(
    () => (staff ?? []).filter((s) => s.id !== currentUserId && s.status !== 'TERMINATED'),
    [staff, currentUserId]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return eligible.filter((s) => {
      if (onlyNew && s.lastLoginAt) return false;
      if (!q) return true;
      return [s.firstName, s.lastName, s.employeeId, s.email, s.branch?.name ?? '']
        .some((v) => v.toLowerCase().includes(q));
    });
  }, [eligible, onlyNew, search]);

  // Each time the picker opens, start with everyone who has never signed in.
  useEffect(() => {
    if (!open) return;
    setResults(initialResults ?? null);
    setSelected(new Set(eligible.filter((s) => !s.lastLoginAt).map((s) => s.id)));
    setOnlyNew(true);
    setSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedActive = eligible.filter((s) => selected.has(s.id) && s.lastLoginAt).length;
  const allVisibleSelected = visible.length > 0 && visible.every((s) => selected.has(s.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of visible) {
        if (allVisibleSelected) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });

  const issue = () => {
    startTransition(async () => {
      const result = await issueLoginDetails(Array.from(selected));
      if (result.success && result.data) {
        setResults(result.data);
        toast.success(result.message);
      } else {
        toast.error(result.error || 'Failed to issue login details');
      }
    });
  };

  const copyRow = async (r: IssuedLogin) => {
    if (await copy(asMessage(r), `${r.name}'s details`)) {
      setCopiedId(r.staffId);
      setTimeout(() => setCopiedId((id) => (id === r.staffId ? null : id)), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            {results ? 'Login details' : 'Issue login details'}
          </DialogTitle>
          <DialogDescription>
            {results
              ? 'Copy these now and send each person their own. They are shown once and are not stored anywhere readable.'
              : 'Existing passwords cannot be shown (they are stored encrypted), so this issues a new temporary password to each person you pick. Each must set their own at first sign-in.'}
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => copy(results.map(asMessage).join('\n\n'), 'All login details')}>
                <Copy className="mr-2 h-4 w-4" />Copy all as messages
              </Button>
              <Button size="sm" variant="outline" onClick={() => copy(asSpreadsheet(results), 'Table')}>
                <Table2 className="mr-2 h-4 w-4" />Copy as table (Excel / Sheets)
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email (username)</TableHead>
                    <TableHead>Temporary password</TableHead>
                    <TableHead className="text-right">Send</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => (
                    <TableRow key={r.staffId}>
                      <TableCell>
                        <div className="text-sm font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[r.employeeId, r.role, r.branch].filter(Boolean).join(' · ')}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.email}</TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-2 py-1 font-mono text-sm select-all">{r.tempPassword}</code>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => copyRow(r)}>
                          {copiedId === r.staffId
                            ? <><Check className="mr-1 h-4 w-4 text-emerald-600" />Copied</>
                            : <><Copy className="mr-1 h-4 w-4" />Copy</>}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Input
                placeholder="Search name, ID, email, branch..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="sm:w-72"
              />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={onlyNew} onCheckedChange={(v) => setOnlyNew(v === true)} />
                Only staff who have never signed in
              </label>
            </div>

            <div className="max-h-[45vh] overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} aria-label="Select all shown" />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role · Branch</TableHead>
                    <TableHead>Sign-in</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        {onlyNew ? 'Everyone has signed in at least once. Untick the filter to reissue someone.' : 'No staff match.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visible.map((s) => (
                      <TableRow key={s.id} className="cursor-pointer" onClick={() => toggle(s.id)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} aria-label={`Select ${s.firstName}`} />
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{s.firstName} {s.lastName}</div>
                          <div className="text-xs text-muted-foreground">{s.employeeId} · {s.email}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {[s.role?.name, s.branch?.name ?? 'Head office'].filter(Boolean).join(' · ')}
                        </TableCell>
                        <TableCell>
                          {s.lastLoginAt
                            ? <Badge variant="secondary">Has signed in</Badge>
                            : <Badge variant="warning">Never signed in</Badge>}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {selectedActive > 0 && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {selectedActive} selected {selectedActive === 1 ? 'person has' : 'people have'} already signed in.
                Their current password will stop working and they will need the new one you send.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {results ? 'Done' : 'Cancel'}
          </Button>
          {!results && (
            <Button onClick={issue} disabled={isPending || selected.size === 0}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Issue details for {selected.size} staff
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
