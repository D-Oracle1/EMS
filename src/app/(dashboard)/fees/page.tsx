import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { canViewFeeReport } from '@/lib/fees';
import { getFeeReport, type FeeReportFilters } from '@/actions/fee.actions';
import { FeeReportClient } from './fee-report-client';

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Fees and default charges collected, discounts and waivers, and what is owed. Filters live in the address. */
export default async function FeesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await auth();
  if (!session) redirect('/login');
  const user = session.user as SessionUser;
  if (!canViewFeeReport(user)) redirect('/dashboard');

  const q = await searchParams;
  const filters: FeeReportFilters = {
    from: one(q.from),
    to: one(q.to),
    type: one(q.type) as FeeReportFilters['type'],
    branchId: one(q.branch),
    paymentMode: one(q.mode),
    receivedById: one(q.officer),
  };
  const report = await getFeeReport(filters);
  return <FeeReportClient report={report} filters={filters} />;
}
