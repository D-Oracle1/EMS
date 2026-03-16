import { auth } from './auth';
import type { SessionUser } from '@/types';

/**
 * Get the current session - throws if not authenticated
 */
export async function getSession(): Promise<{ user: SessionUser }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Not authenticated');
  }
  return session as unknown as { user: SessionUser };
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(user: SessionUser, permission: string): boolean {
  return user.permissions.includes(permission);
}

/**
 * Check if user has any of the specified permissions
 */
export function hasAnyPermission(user: SessionUser, permissions: string[]): boolean {
  return permissions.some((p) => user.permissions.includes(p));
}

/**
 * Check if user has all of the specified permissions
 */
export function hasAllPermissions(user: SessionUser, permissions: string[]): boolean {
  return permissions.every((p) => user.permissions.includes(p));
}

/**
 * Require a specific permission - throws if not authorized
 */
export async function requirePermission(permission: string): Promise<SessionUser> {
  const { user } = await getSession();
  if (!hasPermission(user, permission)) {
    throw new Error(`Permission denied: ${permission}`);
  }
  return user;
}

/**
 * Require any of the specified permissions
 */
export async function requireAnyPermission(permissions: string[]): Promise<SessionUser> {
  const { user } = await getSession();
  if (!hasAnyPermission(user, permissions)) {
    throw new Error(`Permission denied: requires one of ${permissions.join(', ')}`);
  }
  return user;
}

/**
 * Check if user has permissions for a module
 */
export function hasModuleAccess(user: SessionUser, module: string): boolean {
  return user.permissions.some((p) => p.startsWith(`${module}:`));
}
