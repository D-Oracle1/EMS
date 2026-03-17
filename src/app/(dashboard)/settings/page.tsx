'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { markOverdueLoans, accrueFixedDepositInterest, markAbsentees, getBatchJobStatus, runMonthlySavingsInterestBatch, runMaturityProcessingBatch } from '@/actions/batch.actions';
import type { SessionUser } from '@/types';

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
      // User may not have permission
    }
  }

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
      <h1 className="text-3xl font-bold">System Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Application</p>
              <p className="font-medium">Hylink Finance EMS v2.0</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Framework</p>
              <p className="font-medium">Next.js 14 (App Router)</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Database</p>
              <p className="font-medium">PostgreSQL (Supabase)</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Authentication</p>
              <p className="font-medium">NextAuth v5 (JWT)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Batch Operations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Run batch operations manually. In production these run automatically via Vercel Cron.
          </p>

          {batchStatus && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
              <div className="text-center p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{batchStatus.activeLoans}</p>
                <p className="text-xs text-muted-foreground">Active Loans</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold text-red-600">{batchStatus.overdueLoans}</p>
                <p className="text-xs text-muted-foreground">Overdue Loans</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{batchStatus.activeFDs}</p>
                <p className="text-xs text-muted-foreground">Active FDs</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold text-blue-600">{batchStatus.activeFixedSavings}</p>
                <p className="text-xs text-muted-foreground">Fixed Savings</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold text-orange-600">{batchStatus.pendingTerminations}</p>
                <p className="text-xs text-muted-foreground">Pending Exits</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{batchStatus.pendingVerifications}</p>
                <p className="text-xs text-muted-foreground">Verifications</p>
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Mark Overdue Loans</p>
                <p className="text-sm text-muted-foreground">Identify loans with past-due installments</p>
              </div>
              <Button variant="outline" onClick={() => runBatchJob('overdue')} disabled={loading !== null}>
                {loading === 'overdue' ? 'Running...' : 'Run'}
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Accrue FD Interest</p>
                <p className="text-sm text-muted-foreground">Calculate daily interest on active fixed deposits</p>
              </div>
              <Button variant="outline" onClick={() => runBatchJob('fd-interest')} disabled={loading !== null}>
                {loading === 'fd-interest' ? 'Running...' : 'Run'}
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Mark Absentees</p>
                <p className="text-sm text-muted-foreground">Mark staff without attendance records as absent</p>
              </div>
              <Button variant="outline" onClick={() => runBatchJob('absentees')} disabled={loading !== null}>
                {loading === 'absentees' ? 'Running...' : 'Run'}
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Monthly Savings Interest</p>
                <p className="text-sm text-muted-foreground">Accrue monthly interest on all active fixed-term savings accounts and roll pending deposits into eligible balance</p>
              </div>
              <Button variant="outline" onClick={() => runBatchJob('savings-interest')} disabled={loading !== null}>
                {loading === 'savings-interest' ? 'Running...' : 'Run'}
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Process Matured Savings</p>
                <p className="text-sm text-muted-foreground">Pay out and complete all fixed savings accounts that have reached their maturity date</p>
              </div>
              <Button variant="outline" onClick={() => runBatchJob('savings-maturity')} disabled={loading !== null}>
                {loading === 'savings-maturity' ? 'Running...' : 'Run'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current User</CardTitle>
        </CardHeader>
        <CardContent>
          {user && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{user.firstName} {user.lastName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Employee ID</p>
                <p className="font-medium">{user.employeeId}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Role</p>
                <Badge>{user.role}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Department</p>
                <p className="font-medium">{user.department || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Branch</p>
                <p className="font-medium">{user.branchName || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Permissions</p>
                <p className="font-medium">{user.permissions?.length || 0} permissions</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
