'use client';

import { useEffect, useState } from 'react';
import {
  Wallet, Landmark, PiggyBank, Loader2, Plus, ArrowDownCircle, User, TrendingUp, Bell,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { getMyNotifications, markMyNotificationsRead } from '@/actions/portal.actions';
import {
  getMyPortalData, updateMyProfile, requestMyWithdrawal, getPortalLoanProducts, applyForLoan,
} from '@/actions/portal.actions';

type PortalData = Awaited<ReturnType<typeof getMyPortalData>>;
type LoanProduct = Awaited<ReturnType<typeof getPortalLoanProducts>>[number];

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'secondary' | 'default'> = {
  ACTIVE: 'success', DISBURSED: 'success', COMPLETED: 'secondary', CLOSED: 'secondary',
  DRAFT: 'default', PENDING_VERIFICATION: 'warning', PENDING_APPROVAL: 'warning',
  OVERDUE: 'error', DEFAULTED: 'error', REJECTED: 'error', MATURED: 'default',
};

export function PortalClient() {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notices, setNotices] = useState<{ unread: number; items: any[] }>({ unread: 0, items: [] });

  const load = () => {
    setLoading(true);
    getMyPortalData().then(setData).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
    // A failure here must not stop the accounts rendering.
    getMyNotifications(20).then(setNotices).catch(() => undefined);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading your accounts…
      </div>
    );
  }
  if (!data) return null;

  const totalSavings = data.savings.reduce((s, a) => s + a.currentBalance, 0);
  const activeLoans = data.loans.filter((l) => ['ACTIVE', 'DISBURSED', 'OVERDUE'].includes(l.status)).length;

  return (
    <div className="space-y-5 animate-rise">
      {/* Balance summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="premium-card p-4">
          <div className="icon-tile icon-tile-sm icon-tile-emerald"><Wallet className="h-4 w-4" /></div>
          <p className="mt-2 text-xl font-bold">{formatCurrency(totalSavings)}</p>
          <p className="text-xs text-muted-foreground">Total savings</p>
        </div>
        <div className="premium-card p-4">
          <div className="icon-tile icon-tile-sm icon-tile-orange"><Landmark className="h-4 w-4" /></div>
          <p className="mt-2 text-xl font-bold">{activeLoans}</p>
          <p className="text-xs text-muted-foreground">Active loan{activeLoans !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <LoanApplyDialog onDone={load} />
        <ProfileDialog data={data} onDone={load} />
      </div>

      {/* What your money has been doing */}
      {notices.items.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Bell className="h-4 w-4 text-emerald-600" /> Activity
              {notices.unread > 0 && (
                <Badge variant="success" className="text-[10px]">{notices.unread} new</Badge>
              )}
            </h2>
            {notices.unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={async () => {
                  await markMyNotificationsRead();
                  getMyNotifications(20).then(setNotices).catch(() => undefined);
                }}
              >
                Mark all read
              </Button>
            )}
          </div>

          <div className="premium-card divide-y">
            {notices.items.slice(0, 8).map((n) => (
              <div key={n.id} className={`p-3 ${n.isRead ? '' : 'bg-emerald-50/50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{n.title}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDateTime(n.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Savings */}
      <section className="space-y-2">
        <h2 className="font-semibold flex items-center gap-2"><PiggyBank className="h-4 w-4 text-emerald-600" /> Savings</h2>
        {data.savings.length === 0 ? (
          <p className="premium-card p-4 text-sm text-muted-foreground">No savings accounts yet.</p>
        ) : data.savings.map((s) => (
          <div key={s.id} className="premium-card p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-medium truncate">{s.product}</p>
                <p className="text-xs text-muted-foreground">{s.accountNumber}</p>
              </div>
              <Badge variant={statusVariant[s.status] ?? 'secondary'}>{s.status.replace(/_/g, ' ')}</Badge>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <p className="text-lg font-bold">{formatCurrency(s.currentBalance)}</p>
                {s.interestAccrued > 0 && (
                  <p className="text-xs text-emerald-600">+{formatCurrency(s.interestAccrued)} interest</p>
                )}
              </div>
              {s.status === 'ACTIVE' && (
                <WithdrawDialog accountId={s.id} accountNumber={s.accountNumber} balance={s.currentBalance} onDone={load} />
              )}
            </div>
            {s.maturityDate && (
              <p className="text-xs text-muted-foreground mt-1">
                Matures {new Date(s.maturityDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                {s.monthsRemaining != null ? ` · ${s.monthsRemaining} month(s) left` : ''}
              </p>
            )}
          </div>
        ))}
      </section>

      {/* Loans */}
      <section className="space-y-2">
        <h2 className="font-semibold flex items-center gap-2"><Landmark className="h-4 w-4 text-orange-600" /> Loans</h2>
        {data.loans.length === 0 ? (
          <p className="premium-card p-4 text-sm text-muted-foreground">No loans yet.</p>
        ) : data.loans.map((l) => (
          <div key={l.id} className="premium-card p-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-medium truncate">{l.product}</p>
              <p className="text-xs text-muted-foreground">{l.loanNumber} · {l.tenure} months @ {l.interestRate}%</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-semibold">{formatCurrency(l.principalAmount)}</p>
              <Badge variant={statusVariant[l.status] ?? 'secondary'} className="mt-1">{l.status.replace(/_/g, ' ')}</Badge>
            </div>
          </div>
        ))}
      </section>

      {/* Fixed deposits */}
      {data.fixedDeposits.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-violet-600" /> Fixed Deposits</h2>
          {data.fixedDeposits.map((f) => (
            <div key={f.id} className="premium-card p-4 flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-medium truncate">{f.certificateNumber}</p>
                <p className="text-xs text-muted-foreground">
                  Matures {new Date(f.maturityDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold">{formatCurrency(f.maturityAmount)}</p>
                <Badge variant={statusVariant[f.status] ?? 'secondary'} className="mt-1">{f.status.replace(/_/g, ' ')}</Badge>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function WithdrawDialog({ accountId, accountNumber, balance, onDone }: {
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

function LoanApplyDialog({ onDone }: { onDone: () => void }) {
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
          <div className="grid grid-cols-2 gap-3">
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

function ProfileDialog({ data, onDone }: { data: PortalData; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const c = data.customer;
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
            {c?.title ? `${c.title} ` : ''}{c?.firstName} {c?.lastName} · {c?.customerNumber}
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
