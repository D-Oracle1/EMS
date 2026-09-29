'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Building2, Users, UserCog, Landmark, PiggyBank, Wallet, Activity,
  Search, MapPin, Phone, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/ui/stat-card';
import { formatCurrency } from '@/lib/utils';
import type { getBranchOverview } from '@/actions/branch.actions';

type Branch = Awaited<ReturnType<typeof getBranchOverview>>[number];

export function BranchesClient({ branches }: { branches: Branch[] }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) =>
      [b.name, b.code, b.address ?? ''].some((v) => v.toLowerCase().includes(q))
    );
  }, [branches, search]);

  const totals = useMemo(
    () =>
      branches.reduce(
        (t, b) => ({
          staff: t.staff + b.staffCount,
          customers: t.customers + b.customerCount,
          portfolio: t.portfolio + b.loanPortfolio,
          savings: t.savings + b.savingsBalance + b.fixedDepositPrincipal,
        }),
        { staff: 0, customers: 0, portfolio: 0, savings: 0 }
      ),
    [branches]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Branches</h1>
          <p className="text-muted-foreground">
            Open any branch to see its staff, customers, loans, savings, deposits, transactions and every action taken there
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search branches..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Branches" color="slate" icon={Building2}
          value={branches.length}
          description={`${branches.filter((b) => b.isActive).length} active`} />
        <StatCard title="Staff" color="indigo" icon={UserCog}
          value={totals.staff} description="Across all branches" />
        <StatCard title="Loan Portfolio" color="orange" icon={Landmark}
          value={formatCurrency(totals.portfolio)} description="Principal on live loans" />
        <StatCard title="Deposits Held" color="emerald" icon={PiggyBank}
          value={formatCurrency(totals.savings)} description="Savings balances + active fixed deposits" />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {branches.length === 0
              ? 'No branches yet. Create one under Organisation.'
              : 'No branch matches your search.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((b) => (
            <Link key={b.id} href={`/branches/${b.id}`} className="group block">
              <Card className="h-full transition-shadow group-hover:shadow-md group-hover:border-indigo-300">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 shrink-0 text-indigo-600" />
                        <h2 className="truncate font-semibold">{b.name}</h2>
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">{b.code}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={b.isActive ? 'success' : 'secondary'}>
                        {b.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>

                  {(b.address || b.phone) && (
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {b.address && (
                        <p className="flex items-center gap-1.5 truncate"><MapPin className="h-3.5 w-3.5 shrink-0" />{b.address}</p>
                      )}
                      {b.phone && (
                        <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" />{b.phone}</p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <Figure icon={UserCog} label="Staff" value={b.staffCount} />
                    <Figure icon={Users} label="Customers" value={b.customerCount} />
                    <Figure icon={Activity} label="Actions (30d)" value={b.activity30d} />
                  </div>

                  <div className="space-y-1.5 border-t pt-3 text-sm">
                    <Row icon={Landmark} label={`Loans · ${b.liveLoanCount} live`} value={formatCurrency(b.loanPortfolio)} />
                    <Row icon={PiggyBank} label={`Savings · ${b.savingsCount} accounts`} value={formatCurrency(b.savingsBalance)} />
                    <Row icon={Wallet} label={`Fixed deposits · ${b.fixedDepositCount}`} value={formatCurrency(b.fixedDepositPrincipal)} />
                  </div>

                  {b.overdueLoanCount > 0 && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {b.overdueLoanCount} overdue or defaulted loan{b.overdueLoanCount === 1 ? '' : 's'}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Figure({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/60 px-2.5 py-2">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Icon className="h-3 w-3" />{label}</p>
      <p className="text-base font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
