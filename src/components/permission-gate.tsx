'use client';

import { useSession } from 'next-auth/react';
import type { SessionUser } from '@/types';

interface PermissionGateProps {
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGate({
  permission,
  permissions,
  requireAll = false,
  children,
  fallback = null,
}: PermissionGateProps) {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;

  if (!user) return <>{fallback}</>;

  const permsToCheck = permission ? [permission] : permissions || [];

  if (permsToCheck.length === 0) return <>{children}</>;

  const hasAccess = requireAll
    ? permsToCheck.every((p) => user.permissions.includes(p))
    : permsToCheck.some((p) => user.permissions.includes(p));

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}
