'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import {
  getChartOfAccounts,
  createManualJournalEntry,
} from '@/actions/accounting.actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Account {
  id: string;
  accountCode: string;
  accountName: string;
  isHeader: boolean;
}

interface JournalLine {
  accountId: string;
  debitAmount: string;
  creditAmount: string;
  description: string;
}

const EMPTY_LINE: JournalLine = {
  accountId: '',
  debitAmount: '',
  creditAmount: '',
  description: '',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NewJournalEntryPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form fields
  const [entryDate, setEntryDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [description, setDescription] = useState('');
  const [narration, setNarration] = useState('');
  const [autoPost, setAutoPost] = useState(false);

  // Journal lines
  const [lines, setLines] = useState<JournalLine[]>([
    { ...EMPTY_LINE },
    { ...EMPTY_LINE },
  ]);

  // COA list for select
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    setLoadingAccounts(true);
    try {
      const data = await getChartOfAccounts();
      // Filter out header accounts -- only show postable accounts
      setAccounts(
        (data as unknown as Account[]).filter((a) => !a.isHeader)
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to load chart of accounts');
    } finally {
      setLoadingAccounts(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Line helpers
  // ---------------------------------------------------------------------------

  function updateLine(index: number, field: keyof JournalLine, value: string) {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }

  function removeLine(index: number) {
    if (lines.length <= 2) {
      toast.error('At least two journal lines are required');
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  // ---------------------------------------------------------------------------
  // Totals
  // ---------------------------------------------------------------------------

  const totalDebit = lines.reduce((sum, l) => {
    const val = parseFloat(l.debitAmount);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const totalCredit = lines.reduce((sum, l) => {
    const val = parseFloat(l.creditAmount);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!description.trim()) {
      toast.error('Description is required');
      return;
    }

    if (!entryDate) {
      toast.error('Entry date is required');
      return;
    }

    // Validate lines
    const validLines = lines.filter(
      (l) => l.accountId && (parseFloat(l.debitAmount) > 0 || parseFloat(l.creditAmount) > 0)
    );

    if (validLines.length < 2) {
      toast.error('At least two valid journal lines are required');
      return;
    }

    if (!isBalanced) {
      toast.error(
        `Total Debits (${formatCurrency(totalDebit)}) must equal Total Credits (${formatCurrency(totalCredit)})`
      );
      return;
    }

    // Check no line has both debit and credit
    for (const line of validLines) {
      const debit = parseFloat(line.debitAmount) || 0;
      const credit = parseFloat(line.creditAmount) || 0;
      if (debit > 0 && credit > 0) {
        toast.error('A journal line cannot have both debit and credit amounts');
        return;
      }
    }

    startTransition(async () => {
      const res = await createManualJournalEntry({
        entryDate,
        description: description.trim(),
        narration: narration.trim() || undefined,
        lines: validLines.map((l) => ({
          accountId: l.accountId,
          debitAmount: parseFloat(l.debitAmount) || 0,
          creditAmount: parseFloat(l.creditAmount) || 0,
          description: l.description.trim() || undefined,
        })),
        autoPost,
      });

      if (res.success) {
        toast.success(res.message || 'Journal entry created successfully');
        router.push('/accounting/journal');
      } else {
        toast.error(res.error || 'Failed to create journal entry');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link href="/accounting/journal">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Journal Entries
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-yellow-50 flex items-center justify-center">
          <FileText className="h-5 w-5 text-yellow-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Manual Journal Entry</h1>
          <p className="text-sm text-muted-foreground">
            Create a new manual journal entry
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Entry Details */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Entry Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Entry Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Description <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of this entry"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Narration</Label>
              <textarea
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                rows={2}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Detailed narration (optional)..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Journal Lines */}
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Journal Lines</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4 mr-1" />
              Add Line
            </Button>
          </CardHeader>
          <CardContent>
            {loadingAccounts ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Loading accounts...</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">Account</TableHead>
                      <TableHead className="w-[160px] text-right">Debit Amount</TableHead>
                      <TableHead className="w-[160px] text-right">Credit Amount</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Select
                            value={line.accountId}
                            onValueChange={(val) => updateLine(index, 'accountId', val)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select account" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts.map((acc) => (
                                <SelectItem key={acc.id} value={acc.id}>
                                  {acc.accountCode} - {acc.accountName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.debitAmount}
                            onChange={(e) =>
                              updateLine(index, 'debitAmount', e.target.value)
                            }
                            placeholder="0.00"
                            className="text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.creditAmount}
                            onChange={(e) =>
                              updateLine(index, 'creditAmount', e.target.value)
                            }
                            placeholder="0.00"
                            className="text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.description}
                            onChange={(e) =>
                              updateLine(index, 'description', e.target.value)
                            }
                            placeholder="Line description"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                            onClick={() => removeLine(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Totals row */}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell className="text-right">Totals</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(totalDebit)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(totalCredit)}
                      </TableCell>
                      <TableCell colSpan={2}>
                        {isBalanced ? (
                          <span className="text-green-600 text-sm">Balanced</span>
                        ) : (
                          <span className="text-red-600 text-sm">
                            Difference: {formatCurrency(Math.abs(totalDebit - totalCredit))}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>

        {/* Options & Submit */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPost}
                  onChange={(e) => setAutoPost(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <div>
                  <p className="text-sm font-medium">Auto-Post</p>
                  <p className="text-xs text-muted-foreground">
                    Automatically post this entry after creation
                  </p>
                </div>
              </label>

              <div className="flex gap-3">
                <Link href="/accounting/journal">
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" disabled={isPending || !isBalanced}>
                  {isPending ? 'Creating...' : 'Create Journal Entry'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
