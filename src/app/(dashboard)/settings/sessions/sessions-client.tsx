'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { MonitorSmartphone, LogOut, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import {
  getActiveSessions,
  revokeSession,
  revokeAllSessionsForStaff,
  purgeExpiredSessions,
} from '@/actions/admin.actions';
import type { SessionUser } from '@/types';

interface SessionsClientProps {
  user: SessionUser;
}

/** Compress a user-agent string into something readable in a table cell. */
function describeAgent(agent: string | null): string {
  if (!agent) return 'Unknown device';

  const browser =
    /Edg\//.test(agent) ? 'Edge'
    : /OPR\//.test(agent) ? 'Opera'
    : /Chrome\//.test(agent) ? 'Chrome'
    : /Safari\//.test(agent) ? 'Safari'
    : /Firefox\//.test(agent) ? 'Firefox'
    : 'Browser';

  const platform =
    /Android/.test(agent) ? 'Android'
    : /iPhone|iPad|iOS/.test(agent) ? 'iOS'
    : /Windows/.test(agent) ? 'Windows'
    : /Mac OS X/.test(agent) ? 'macOS'
    : /Linux/.test(agent) ? 'Linux'
    : '';

  return platform ? `${browser} on ${platform}` : browser;
}

export function SessionsClient({ user }: SessionsClientProps) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [includeExpired, setIncludeExpired] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canManage = user.permissions.includes('SYSTEM:USER_MANAGE');

  function load() {
    startTransition(async () => {
      try {
        const data = await getActiveSessions({ includeExpired });
        setSessions(data);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load sessions');
      }
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeExpired]);

  function revoke(session: any) {
    startTransition(async () => {
      const result = await revokeSession(session.id);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to revoke the session');
      }
    });
  }

  function revokeAll(session: any) {
    startTransition(async () => {
      const result = await revokeAllSessionsForStaff(session.staffId);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to revoke sessions');
      }
    });
  }

  function purge() {
    startTransition(async () => {
      const result = await purgeExpiredSessions();
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to purge sessions');
      }
    });
  }

  const activeCount = sessions.filter((s) => s.isActive).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/settings" className="text-sm text-muted-foreground hover:underline">
              Settings
            </Link>
            <span className="text-muted-foreground">/</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Active Sessions</h1>
          <p className="text-muted-foreground">
            Who is signed in, from where, and the ability to cut access immediately.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={isPending}>
            <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          </Button>
          {canManage && (
            <Button variant="outline" size="sm" onClick={purge} disabled={isPending}>
              <Trash2 className="mr-2 h-4 w-4" />
              Purge Expired
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="include-expired"
          checked={includeExpired}
          onCheckedChange={setIncludeExpired}
        />
        <Label htmlFor="include-expired" className="text-sm font-normal">
          Include expired and revoked sessions
        </Label>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MonitorSmartphone className="h-5 w-5" />
            Sessions
            <Badge variant="secondary">{activeCount} active</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Signed In</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    {isPending
                      ? 'Loading…'
                      : 'No sessions recorded. Session tracking begins at the next sign-in.'}
                  </TableCell>
                </TableRow>
              )}
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>
                    <div className="font-medium">{session.staffName}</div>
                    <div className="text-xs text-muted-foreground">
                      {session.employeeId} · {session.roleName}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{describeAgent(session.userAgent)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {session.ipAddress ?? '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(session.createdAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(session.expiresAt)}
                  </TableCell>
                  <TableCell>
                    {session.revokedAt ? (
                      <Badge variant="secondary">Revoked</Badge>
                    ) : session.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="outline">Expired</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {canManage && session.isActive && (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => revoke(session)}
                          disabled={isPending}
                          title="Revoke this session"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => revokeAll(session)}
                          disabled={isPending}
                          title="Revoke every session for this staff member"
                        >
                          {isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <span className="text-xs">All</span>
                          )}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
