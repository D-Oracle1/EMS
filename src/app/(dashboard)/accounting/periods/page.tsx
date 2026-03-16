'use client';

import { useState, useEffect, useTransition } from 'react';
import { Calendar, Lock } from 'lucide-react';
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
import { formatDateTime } from '@/lib/utils';
import {
  getFinancialPeriods,
  closePeriodAction,
} from '@/actions/accounting.actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FinancialPeriod {
  id: string;
  year: number;
  month: number;
  status: string;
  openedAt: Date | string | null;
  closedAt: Date | string | null;
  closedById: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
> = {
  OPEN: 'success',
  SOFT_CLOSED: 'warning',
  HARD_CLOSED: 'destructive',
};

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FinancialPeriodsPage() {
  const [isPending, startTransition] = useTransition();

  const [periods, setPeriods] = useState<FinancialPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  // Close period dialog
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeYear, setCloseYear] = useState(String(new Date().getFullYear()));
  const [closeMonth, setCloseMonth] = useState(String(new Date().getMonth() + 1));
  const [closeType, setCloseType] = useState<'SOFT_CLOSE' | 'HARD_CLOSE'>('SOFT_CLOSE');
  const [closeNotes, setCloseNotes] = useState('');

  useEffect(() => {
    loadPeriods();
  }, []);

  async function loadPeriods() {
    setLoading(true);
    try {
      const data = await getFinancialPeriods();
      setPeriods(data as unknown as FinancialPeriod[]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load financial periods');
    } finally {
      setLoading(false);
    }
  }

  function openCloseDialog() {
    setCloseYear(String(new Date().getFullYear()));
    setCloseMonth(String(new Date().getMonth() + 1));
    setCloseType('SOFT_CLOSE');
    setCloseNotes('');
    setCloseDialogOpen(true);
  }

  async function handleClosePeriod() {
    const year = parseInt(closeYear, 10);
    const month = parseInt(closeMonth, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      toast.error('Please select a valid year and month');
      return;
    }

    startTransition(async () => {
      const res = await closePeriodAction(
        year,
        month,
        closeType,
        closeNotes.trim() || undefined
      );

      if (res.success) {
        toast.success(res.message || 'Period closed successfully');
        setCloseDialogOpen(false);
        loadPeriods();
      } else {
        toast.error(res.error || 'Failed to close period');
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
            <Calendar className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Financial Periods</h1>
            <p className="text-sm text-muted-foreground">
              Manage financial period open/close status
            </p>
          </div>
        </div>
        <Button onClick={openCloseDialog}>
          <Lock className="h-4 w-4 mr-2" />
          Close Period
        </Button>
      </div>

      {/* Periods Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Periods</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="font-medium">Loading periods...</p>
            </div>
          ) : periods.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No financial periods found</p>
              <p className="text-sm mt-1">
                Financial periods are created automatically when journal entries are posted
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Year</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Opened At</TableHead>
                  <TableHead>Closed At</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((period) => (
                  <TableRow key={period.id}>
                    <TableCell className="font-medium">{period.year}</TableCell>
                    <TableCell>
                      {MONTH_NAMES[period.month] || period.month}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[period.status] || 'secondary'}>
                        {period.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {period.openedAt ? formatDateTime(period.openedAt) : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {period.closedAt ? formatDateTime(period.closedAt) : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">
                      {period.notes || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* --------------------------------------------------------------- */}
      {/* Close Period Dialog                                             */}
      {/* --------------------------------------------------------------- */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Close Financial Period</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select the period you want to close and the type of closure.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Year</Label>
                <Input
                  type="number"
                  value={closeYear}
                  onChange={(e) => setCloseYear(e.target.value)}
                  min={2020}
                  max={2099}
                />
              </div>
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={closeMonth} onValueChange={setCloseMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.slice(1).map((name, idx) => (
                      <SelectItem key={idx + 1} value={String(idx + 1)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Close Type</Label>
              <Select
                value={closeType}
                onValueChange={(val) =>
                  setCloseType(val as 'SOFT_CLOSE' | 'HARD_CLOSE')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SOFT_CLOSE">Soft Close</SelectItem>
                  <SelectItem value="HARD_CLOSE">Hard Close</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {closeType === 'SOFT_CLOSE'
                  ? 'Soft close prevents regular posting but allows adjustments.'
                  : 'Hard close permanently prevents any further posting to this period.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <textarea
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                rows={2}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Additional notes about this period close..."
              />
            </div>

            {closeType === 'HARD_CLOSE' && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-800 font-medium">Warning</p>
                <p className="text-xs text-red-700 mt-1">
                  A hard close is permanent and cannot be undone. No further journal entries
                  can be posted to this period after a hard close.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCloseDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleClosePeriod}
              disabled={isPending}
              variant={closeType === 'HARD_CLOSE' ? 'destructive' : 'default'}
            >
              {isPending
                ? 'Closing...'
                : closeType === 'HARD_CLOSE'
                ? 'Hard Close Period'
                : 'Soft Close Period'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
