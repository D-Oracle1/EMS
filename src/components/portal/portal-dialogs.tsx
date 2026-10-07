'use client';

/**
 * The customer portal's dialogs: request a withdrawal, apply for a loan, and
 * update contact details. Each submits to portal.actions, which checks the
 * customer owns what they act on; staff review every request.
 */
import { useEffect, useState } from 'react';
import { Loader2, Plus, ArrowDownCircle, User } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { requestMyWithdrawal, getPortalLoanProducts, applyForLoan, updateMyProfile } from '@/actions/portal.actions';

type LoanProduct = Awaited<ReturnType<typeof getPortalLoanProducts>>[number];

export function WithdrawDialog({ accountId, accountNumber, balance, onDone }: {
  accountId: string; accountNumber: string; balance: number; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const r = await requestMyWithdrawal({ accountId, amount: parseFloat(amount), reason });
    setBusy(false);
    if (r.success) { toast.success(r.message || 'Requested'); setOpen(false); setAmount(''); setReason(''); onDone(); }
    else toast.error(r.error);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full">
          <ArrowDownCircle className="h-4 w-4 mr-1" /> Withdraw
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Request Withdrawal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {accountNumber} · Available {formatCurrency(balance)}
          </p>
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. School fees" />
          </div>
          <p className="text-xs text-muted-foreground">Withdrawal requests are reviewed and approved by staff.</p>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !amount} className="rounded-full">
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LoanApplyDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<LoanProduct[]>([]);
  const [productId, setProductId] = useState('');
  const [amount, setAmount] = useState('');
  const [tenure, setTenure] = useState('');
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && products.length === 0) getPortalLoanProducts().then(setProducts).catch(() => {});
  }, [open, products.length]);

  const product = products.find((p) => p.id === productId);

  const submit = async () => {
    setBusy(true);
    const r = await applyForLoan({ productId, amount: parseFloat(amount), tenure: parseInt(tenure, 10), purpose });
    setBusy(false);
    if (r.success) { toast.success(r.message || 'Applied'); setOpen(false); onDone(); }
    else toast.error(r.error);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-1" /> Apply for Loan</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Apply for a Loan</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Loan Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Select a product" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} — {p.interestRate}% p.a.</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {product && (
              <p className="text-xs text-muted-foreground">
                {formatCurrency(product.minAmount)}–{formatCurrency(product.maxAmount)} · {product.minTenure}–{product.maxTenure} months
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Tenure (months)</Label>
              <Input type="number" min="1" value={tenure} onChange={(e) => setTenure(e.target.value)} placeholder="12" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Purpose (optional)</Label>
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Business expansion" />
          </div>
          <p className="text-xs text-muted-foreground">Your application is submitted for staff review.</p>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !productId || !amount || !tenure} className="rounded-full">
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Submit Application
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProfileDialog({ customer: c, onDone }: {
  customer: { name: string; customerNumber: string; phone: string | null; email: string | null; address: string | null };
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(c?.phone ?? '');
  const [email, setEmail] = useState(c?.email ?? '');
  const [address, setAddress] = useState(c?.address ?? '');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const r = await updateMyProfile({ phone, email, address });
    setBusy(false);
    if (r.success) { toast.success('Profile updated'); setOpen(false); onDone(); }
    else toast.error(r.error);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full"><User className="h-4 w-4 mr-1" /> Profile</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>My Profile</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {c.name} · {c.customerNumber}
          </p>
          <div className="space-y-1.5"><Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy} className="rounded-full">
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
