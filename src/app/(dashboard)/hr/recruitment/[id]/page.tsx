import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { getJobOpeningDetail } from '@/actions/recruitment.actions';
import type { SessionUser } from '@/types';
import { OpeningDetailClient } from './opening-detail-client';

export default async function JobOpeningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  const { id } = await params;

  let opening;
  try {
    opening = await getJobOpeningDetail(id);
  } catch {
    notFound();
  }

  return <OpeningDetailClient opening={opening} user={session.user as SessionUser} />;
}
