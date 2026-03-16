'use client';

import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import {
  FileText,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  getJournalEntries,
  postJournalEntryAction,
  reverseJournalEntryAction,
} from '@/actions/accounting.actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JournalLine {
  id: string;
  debitAmount: number;
  creditAmount: number;
  description: string | null;
  account: { accountCode: string; accountName: string };
}

interface JournalEntry {
  id: string;
  entryNumber: string;
  entryDate: Date | string;
  description: string;
  sourceModule: string;
  totalDebit: number;
  totalCredit: number;
  status: string;
  createdAt: Date | string;
  createdBy: { firstName: string; lastName: string };
  lines: JournalLine[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
> = {
  DRAFT: 'warning',
  PENDING_APPROVAL: 'info',
  POSTED: 'success',
  REVERSED: 'secondary',
  VOIDED: 'destructive',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function JournalEntriesPage() {
  const [isPending, startTransition] = useTransition();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Confirm dialogs
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [postEntryId, setPostEntryId] = useState<string | null>(null);
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false);
  const [reverseEntryId, setReverseEntryId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  useEffect(() => {
    fetchEntries(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sourceFilter, startDate, endDate]);

  async function fetchEntries(page: number) {
    setLoading(true);
    try {
      const filters: Record<string, unknown> = { page, limit: 20 };
      if (statusFilter !== 'ALL') filters.status = statusFilter;
      if (sourceFilter !== 'ALL') filters.sourceModule = sourceFilter;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const result = await getJournalEntries(filters as any);
      setEntries(result.data as unknown as JournalEntry[]);
      setPagination(result.pagination);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load journal entries');
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(entryId: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  }

  function handlePageChange(page: number) {
    fetchEntries(page);
  }

  // Post entry
  function openPostDialog(entryId: string) {
    setPostEntryId(entryId);
    setPostDialogOpen(true);
  }

  async function handlePostEntry() {
    if (!postEntryId) return;
    startTransition(async () => {
      const res = await postJournalEntryAction(postEntryId);
      if (res.success) {
        toast.success(res.message || 'Journal entry posted');
        setPostDialogOpen(false);
        setPostEntryId(null);
        fetchEntries(pagination.page);
      } else {
        toast.error(res.error || 'Failed to post entry');
      }
    });
  }

  // Reverse entry
  function openReverseDialog(entryId: string) {
    setReverseEntryId(entryId);
    setReverseReason('');
    setReverseDialogOpen(true);
  }

  async function handleReverseEntry() {
    if (!reverseEntryId || !reverseReason.trim()) {
      toast.error('Please provide a reason for reversal');
      return;
    }
    startTransition(async () => {
      const res = await reverseJournalEntryAction(reverseEntryId, reverseReason.trim());
      if (res.success) {
        toast.success(res.message || 'Journal entry reversed');
        setReverseDialogOpen(false);
        setReverseEntryId(null);
        setReverseReason('');
        fetchEntries(pagination.page);
      } else {
        toast.error(res.error || 'Failed to reverse entry');
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-yellow-50 flex items-center justify-center">
            <FileText className="h-5 w-5 text-yellow-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Journal Entries</h1>
            <p className="text-sm text-muted-foreground">
              {pagination.total} total entr{pagination.total !== 1 ? 'ies' : 'y'}
            </p>
          </div>
        </div>
        <Link href="/accounting/journal/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Journal Entry
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="POSTED">Posted</SelectItem>
              <SelectItem value="REVERSED">Reversed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Source Module</Label>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Sources</SelectItem>
              <SelectItem value="MANUAL">Manual</SelectItem>
              <SelectItem value="LOAN">Loan</SelectItem>
              <SelectItem value="SAVINGS">Savings</SelectItem>
              <SelectItem value="FIXED_DEPOSIT">Fixed Deposit</SelectItem>
              <SelectItem value="FEES">Fees</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Start Date</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-[160px]"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">End Date</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-[160px]"
          />
        </div>
      </div>

      {/* Journal Entries Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="font-medium">Loading entries...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No journal entries found</p>
              <p className="text-sm mt-1">Try adjusting your filters or create a new entry</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Entry Number</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Total Debit</TableHead>
                    <TableHead className="text-right">Total Credit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const isExpanded = expandedRows.has(entry.id);
                    return (
                      <>
                        <TableRow key={entry.id} className="cursor-pointer">
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => toggleRow(entry.id)}
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="font-mono text-sm font-medium">
                            {entry.entryNumber}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(entry.entryDate)}
                          </TableCell>
                          <TableCell>
                            <p className="text-sm max-w-[250px] truncate">
                              {entry.description}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {entry.sourceModule.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(entry.totalDebit)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(entry.totalCredit)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT[entry.status] || 'secondary'}>
                              {entry.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {entry.status === 'DRAFT' && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => openPostDialog(entry.id)}
                                  disabled={isPending}
                                >
                                  Post
                                </Button>
                              )}
                              {entry.status === 'POSTED' && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => openReverseDialog(entry.id)}
                                  disabled={isPending}
                                >
                                  Reverse
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expanded lines */}
                        {isExpanded && (
                          <TableRow key={`${entry.id}-lines`}>
                            <TableCell colSpan={9} className="bg-muted/30 p-0">
                              <div className="p-4">
                                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                                  Journal Lines
                                </p>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Account Code</TableHead>
                                      <TableHead>Account Name</TableHead>
                                      <TableHead>Description</TableHead>
                                      <TableHead className="text-right">Debit</TableHead>
                                      <TableHead className="text-right">Credit</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {entry.lines.map((line) => (
                                      <TableRow key={line.id}>
                                        <TableCell className="font-mono text-xs">
                                          {line.account.accountCode}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                          {line.account.accountName}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                          {line.description || '-'}
                                        </TableCell>
                                        <TableCell className="text-right text-sm">
                                          {line.debitAmount > 0
                                            ? formatCurrency(line.debitAmount)
                                            : '-'}
                                        </TableCell>
                                        <TableCell className="text-right text-sm">
                                          {line.creditAmount > 0
                                            ? formatCurrency(line.creditAmount)
                                            : '-'}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total}{' '}
                    results)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page <= 1 || isPending || loading}
                      onClick={() => handlePageChange(pagination.page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        pagination.page >= pagination.totalPages || isPending || loading
                      }
                      onClick={() => handlePageChange(pagination.page + 1)}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* --------------------------------------------------------------- */}
      {/* Post Confirm Dialog                                             */}
      {/* --------------------------------------------------------------- */}
      <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Post Journal Entry</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to post this journal entry? Once posted, it will update
            the general ledger balances and cannot be edited.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPostDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handlePostEntry} disabled={isPending}>
              {isPending ? 'Posting...' : 'Confirm Post'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --------------------------------------------------------------- */}
      {/* Reverse Confirm Dialog                                          */}
      {/* --------------------------------------------------------------- */}
      <Dialog open={reverseDialogOpen} onOpenChange={setReverseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reverse Journal Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will create a reversing entry to negate the original posting. Please
              provide a reason for the reversal.
            </p>
            <div className="space-y-2">
              <Label>
                Reason for Reversal <span className="text-red-500">*</span>
              </Label>
              <textarea
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                rows={3}
                required
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Explain why this entry needs to be reversed..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReverseDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReverseEntry}
              disabled={isPending || !reverseReason.trim()}
            >
              {isPending ? 'Reversing...' : 'Confirm Reversal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
