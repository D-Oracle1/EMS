'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ShieldCheck,
  Building2,
  Landmark,
  PiggyBank,
  Wallet,
  SlidersHorizontal,
  MonitorSmartphone,
  ChevronRight,
  Play,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  markOverdueLoans,
  accrueFixedDepositInterest,
  markAbsentees,
  getBatchJobStatus,
  runMonthlySavingsInterestBatch,
  runMaturityProcessingBatch,
} from '@/actions/batch.actions';
import type { SessionUser } from '@/types';

interface ConsoleLink {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
  permissions: string[];
}

const CONSOLE_LINKS: ConsoleLink[] = [
  {
    href: '/settings/roles',
    title: 'Roles & Permissions',
    description: 'Define roles, set approval limits and grant permissions from the matrix.',
    icon: ShieldCheck,
    permissions: ['SYSTEM:USER_MANAGE', 'ADMIN:SYSTEM'],
  },
  {
    href: '/settings/organisation',
    title: 'Branches & Departments',
    description: 'Create and manage the branch network and departmental structure.',
    icon: Building2,
    permissions: ['SYSTEM:CONFIG_MANAGE'],
  },
  {
    href: '/settings/loan-products',
    title: 'Loan Products',
    description: 'Configure lending products, rates, tenures, fees and GL mappings.',
    icon: Landmark,
    permissions: ['SYSTEM:CONFIG_MANAGE'],
  },
  {
    href: '/settings/savings-products',
    title: 'Savings Products',
    description: 'Fixed-term savings products, interest methods and termination rules.',
    icon: PiggyBank,
    permissions: ['SETTINGS:MANAGE', 'SYSTEM:CONFIG_MANAGE'],
  },
  {
    href: '/settings/deposit-rates',
    title: 'Fixed Deposit Rates',
    description: 'Tenure and amount rate bands used to price fixed deposits.',
    icon: Wallet,
    permissions: ['SYSTEM:CONFIG_MANAGE'],
  },
  {
    href: '/settings/configuration',
    title: 'System Configuration',
    description: 'Organisation details, working hours, payroll rates, security policy.',
    icon: SlidersHorizontal,
    permissions: ['SYSTEM:CONFIG_MANAGE'],
  },
  {
    href: '/settings/sessions',
    title: 'Active Sessions',
    description: 'See who is signed in and revoke sessions when access must be cut.',
    icon: MonitorSmartphone,
    permissions: ['SYSTEM:USER_MANAGE'],
  },
];

const BATCH_JOBS = [
  { key: 'overdue', label: 'Mark Overdue Loans', hint: 'Flags loans past their due date and applies penalties.' },
  { key: 'fd-interest', label: 'Accrue Fixed Deposit Interest', hint: 'Posts interest accrual for active deposits.' },
  { key: 'absentees', label: 'Mark Absentees', hint: 'Records ABSENT for staff with no attendance today.' },
  { key: 'savings-interest', label: 'Monthly Savings Interest', hint: 'Runs the monthly savings interest cycle.' },
  { key: 'savings-maturity', label: 'Process Matured Accounts', hint: 'Settles savings accounts that reached maturity.' },
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [loading, setLoading] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<any>(null);

  useEffect(() => {
    loadBatchStatus();
  }, []);

  async function loadBatchStatus() {
    try {
      const status = await getBatchJobStatus();
      setBatchStatus(status);
    } catch {
      // The signed-in user may not have batch permissions.
    }
  }

  const can = (permissions: string[]) =>
    !user ? false : permissions.some((p) => user.permissions.includes(p));

  const visibleLinks = CONSOLE_LINKS.filter((link) => can(link.permissions));
  const canRunBatch = can(['SYSTEM:CONFIG_MANAGE', 'ADMIN:SYSTEM', 'HR:STAFF_UPDATE']);

  async function runBatchJob(job: string) {
    setLoading(job);
    try {
      let result;
      switch (job) {
        case 'overdue':
          result = await markOverdueLoans();
          break;
        case 'fd-interest':
          result = await accrueFixedDepositInterest();
          break;
        case 'absentees':
          result = await markAbsentees();
          break;
        case 'savings-interest':
          result = await runMonthlySavingsInterestBatch();
          break;
        case 'savings-maturity':
          result = await runMaturityProcessingBatch();
          break;
        default:
          return;
      }
      if (result.success) {
        toast.success(result.message);
        loadBatchStatus();
      } else {
        toast.error(result.error);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to run batch job');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground">
          Configure the platform, its products and who can do what.
        </p>
      </div>

      {/* Administration console */}
      {visibleLinks.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href} className="group">
                <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
                  <CardContent className="flex h-full flex-col gap-3 pt-6">
                    <div className="flex items-start justify-between">
                      <span className="rounded-lg bg-primary/10 p-2 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{link.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{link.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* System information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Application</p>
              <p className="font-medium">Hylink Finance EMS v2.0</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Environment</p>
              <p className="font-medium capitalize">{process.env.NODE_ENV}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Signed in as</p>
              <p className="font-medium">
                {user ? `${user.firstName} ${user.lastName}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Role</p>
              <p className="font-medium">{user?.role ?? '—'}</p>
            </div>
          </div>

          {user && (
            <>
              <Separator className="my-4" />
              <div>
                <p className="mb-2 text-sm text-muted-foreground">
                  Your permissions ({user.permissions.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {user.permissions.slice(0, 24).map((permission) => (
                    <Badge key={permission} variant="secondary" className="font-mono text-[11px]">
                      {permission}
                    </Badge>
                  ))}
                  {user.permissions.length > 24 && (
                    <Badge variant="outline">+{user.permissions.length - 24} more</Badge>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Batch operations */}
      {canRunBatch && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Batch Operations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              These run automatically on schedule. Trigger one manually only when catching up
              after an outage.
            </p>
            {batchStatus && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <span className="text-muted-foreground">Last run: </span>
                {batchStatus.lastRun ? new Date(batchStatus.lastRun).toLocaleString() : 'never'}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {BATCH_JOBS.map((job) => (
                <div
                  key={job.key}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{job.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{job.hint}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runBatchJob(job.key)}
                    disabled={loading !== null}
                  >
                    {loading === job.key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
