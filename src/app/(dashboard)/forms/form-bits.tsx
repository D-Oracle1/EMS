'use client';

import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Globe2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function shareUrl(slug: string): string {
  return `${window.location.origin}/f/${slug}`;
}

const noSubscribe = () => () => {};

/** The share link, rendered empty on the server where there is no origin. */
export function useShareUrl(slug: string): string {
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => '');
  return origin ? `${origin}/f/${slug}` : `/f/${slug}`;
}

export async function copyShareLink(slug: string) {
  try {
    await navigator.clipboard.writeText(shareUrl(slug));
    toast.success('Link copied');
  } catch {
    toast.error('Could not copy. Select the link and copy it instead.');
  }
}

export function StatusBadge({ status, accepting }: { status: string; accepting: boolean }) {
  if (status === 'DRAFT') return <Badge variant="secondary">Draft</Badge>;
  if (status === 'CLOSED') return <Badge variant="destructive">Closed</Badge>;
  // Open, but past its closing time.
  if (!accepting) return <Badge variant="warning">Deadline passed</Badge>;
  return <Badge variant="success">Accepting responses</Badge>;
}

export function AudienceBadge({ audience }: { audience: string }) {
  return audience === 'STAFF' ? (
    <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" />Staff only</Badge>
  ) : (
    <Badge variant="outline" className="gap-1"><Globe2 className="h-3 w-3" />Public</Badge>
  );
}
