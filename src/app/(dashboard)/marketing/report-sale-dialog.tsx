'use client';

import { useEffect, useState, useTransition } from 'react';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { SALE_TYPE_LABELS, type SaleType } from '@/lib/marketing-access';
import { findSaleTargets, reportSale } from '@/actions/marketing.actions';

type Customer = Awaited<ReturnType<typeof findSaleTargets>>[number];

/** A pickable record, flattened: "savings:<id>", "loan:<id>" or "fd:<id>". */
interface Option { value: string; label: string; amount?: number }

const TYPE_HELP: Record<SaleType, string> = {
  SAVINGS: 'A savings account you brought in. It must already be opened.',
  LOAN: 'A loan you brought in. It must already be disbursed.',
  FIXED_DEPOSIT: 'A fixed deposit you brought in. It must already be booked.',
  FIELD_COLLECTION: 'Money you collected from a customer. It is posted to their savings or loan only when confirmed.',
};

const PAYMENT_MODES = [
  ['CASH', 'Cash'], ['BANK_TRANSFER', 'Bank transfer'], ['MOBILE_MONEY', 'Mobile money'],
  ['POS', 'POS'], ['CHEQUE', 'Cheque'],
] as const;

function optionsFor(type: SaleType, c: Customer | null): Option[] {
  if (!c) return [];
  const savings = c.savingsAccounts.map((a) => ({
    value: `savings:${a.id}`, label: `Savings ${a.accountNumber}${a.product ? ` · ${a.product}` : ''}`,
  }));
  switch (type) {
    case 'SAVINGS':
      return savings;
    case 'LOAN':
      return c.loans.map((l) => ({ value: `loan:${l.id}`, label: `Loan ${l.loanNumber} · ${formatCurrency(l.principal)}`, amount: l.principal }));
    case 'FIXED_DEPOSIT':
      return c.fixedDeposits.map((f) => ({ value: `fd:${f.id}`, label: `Fixed deposit ${f.certificateNumber} · ${formatCurrency(f.principal)}`, amount: f.principal }));
    case 'FIELD_COLLECTION':
      return [
        ...savings.map((o) => ({ ...o, label: `Deposit to ${o.label}` })),
        ...c.loans.filter((l) => l.repayable).map((l) => ({ value: `loan:${l.id}`, label: `Repayment on loan ${l.loanNumber}` })),
      ];
  }
}

/**
 * Report a sale. With `company`, records a company (direct) sale instead:
 * credited to no staff member and earning no commission.
 */
export function ReportSaleDialog({ open, onOpenChange, onReported, company = false }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReported: () => void;
  company?: boolean;
}) {
  const [type, setType] = useState<SaleType>('FIELD_COLLECTION');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [target, setTarget] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [collectedAt, setCollectedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setType('FIELD_COLLECTION');
    setQuery(''); setResults([]); setCustomer(null); setTarget('');
    setAmount(''); setPaymentMode('CASH'); setPaymentReference('');
    setCollectedAt(new Date().toISOString().slice(0, 10)); setNotes('');
  }, [open]);

  // Search as they type, after a short pause.
  useEffect(() => {
    if (customer || query.trim().length < 2) { setResults([]); return; }
    const handle = setTimeout(async () => {
      setSearching(true);
      try { setResults(await findSaleTargets(query)); }
      catch (e: any) { toast.error(e.message || 'Search failed'); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, customer]);

  const options = optionsFor(type, customer);

  const pickTarget = (value: string) => {
    setTarget(value);
    const option = options.find((o) => o.value === value);
    if (option?.amount && !amount) setAmount(String(option.amount));
  };

  const submit = () => {
    if (!customer || !target) { toast.error('Choose the customer and what the sale is for'); return; }
    const [kind, id] = target.split(':');
    startTransition(async () => {
      const result = await reportSale({
        type,
        customerId: customer.id,
        savingsAccountId: kind === 'savings' ? id : undefined,
        loanId: kind === 'loan' ? id : undefined,
        fixedDepositId: kind === 'fd' ? id : undefined,
        amount: Number(amount),
        paymentMode,
        paymentReference: paymentReference || undefined,
        collectedAt,
        notes: notes || undefined,
        company,
      });
      if (result.success) {
        toast.success(result.message);
        onOpenChange(false);
        onReported();
      } else {
        toast.error(result.error || 'Could not report the sale');
      }
    });
  };

  const isCollection = type === 'FIELD_COLLECTION';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{company ? 'Record a company sale' : 'Report a sale'}</DialogTitle>
          <DialogDescription>
            {company
              ? 'A direct sale by the company, credited to no staff member and earning no commission. Another admin or the accountant confirms it before anything is posted.'
              : 'An admin or the accountant confirms it. Nothing is posted until they do.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{company ? 'What was sold?' : 'What did you bring in?'}</Label>
            <Select value={type} onValueChange={(v) => { setType(v as SaleType); setTarget(''); setAmount(''); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SALE_TYPE_LABELS) as SaleType[]).map((t) => (
                  <SelectItem key={t} value={t}>{SALE_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{TYPE_HELP[type]}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sale-customer">Customer</Label>
            {customer ? (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{customer.name}</div>
                  <div className="text-xs text-muted-foreground">{customer.customerNumber} · {customer.phone}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setCustomer(null); setTarget(''); setQuery(''); }}>Change</Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="sale-customer"
                    className="pl-9"
                    placeholder="Name, phone, customer or account number"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                {searching && <p className="text-xs text-muted-foreground">Searching...</p>}
                {results.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                    {results.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="block w-full px-3 py-2 text-left hover:bg-muted"
                        onClick={() => { setCustomer(c); setResults([]); }}
                      >
                        <div className="text-sm font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.customerNumber} · {c.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <p className="text-xs text-muted-foreground">No customer found. They must be registered before a sale can be reported.</p>
                )}
              </>
            )}
          </div>

          {customer && (
            <div className="space-y-1.5">
              <Label>{isCollection ? 'Where does the money go?' : 'Which one?'}</Label>
              {options.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This customer has nothing that fits a {SALE_TYPE_LABELS[type].toLowerCase()} yet.
                </p>
              ) : (
                <Select value={target} onValueChange={pickTarget}>
                  <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
                  <SelectContent>
                    {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sale-amount">{isCollection ? 'Amount collected' : 'Amount'}</Label>
              <Input id="sale-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale-date">Date</Label>
              <Input id="sale-date" type="date" value={collectedAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setCollectedAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>How was it paid?</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale-ref">Payment reference (optional)</Label>
              <Input id="sale-ref" placeholder="Teller, transfer or POS ref" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sale-notes">Notes (optional)</Label>
            <Textarea id="sale-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={isPending || !customer || !target || !(Number(amount) > 0)}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send for confirmation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
