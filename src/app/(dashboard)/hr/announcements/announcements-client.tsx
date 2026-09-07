'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Megaphone,
  Plus,
  Pin,
  Send,
  CheckCircle2,
  Loader2,
  Users,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  getMyAnnouncements,
  getAnnouncements,
  createAnnouncement,
  publishAnnouncement,
  acknowledgeAnnouncement,
  getAnnouncementAcknowledgements,
} from '@/actions/hr-engagement.actions';
import { getDepartments, getBranches, getRoles } from '@/actions/staff.actions';
import type { SessionUser } from '@/types';

interface AnnouncementsClientProps {
  user: SessionUser;
}

const PRIORITY_VARIANT: Record<string, any> = {
  LOW: 'secondary',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'error',
};

const CATEGORIES = ['GENERAL', 'POLICY', 'EVENT', 'HOLIDAY', 'EMERGENCY'];

const emptyForm = {
  title: '',
  body: '',
  category: 'GENERAL',
  priority: 'NORMAL',
  audienceType: 'ALL',
  audienceId: '',
  expiresAt: '',
  requiresAck: false,
  pinned: false,
  publishNow: true,
};

export function AnnouncementsClient({ user }: AnnouncementsClientProps) {
  const [mine, setMine] = useState<any[]>([]);
  const [all, setAll] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [ackReport, setAckReport] = useState<any>(null);
  const [isPending, startTransition] = useTransition();

  const canAnnounce = user.permissions.includes('HR:ANNOUNCE');

  function load() {
    startTransition(async () => {
      try {
        setMine(await getMyAnnouncements());
        if (canAnnounce) setAll(await getAnnouncements(true));
      } catch (e: any) {
        toast.error(e.message || 'Failed to load announcements');
      }
    });
  }

  useEffect(() => {
    load();
    if (canAnnounce) {
      Promise.all([getDepartments(), getBranches(), getRoles()])
        .then(([d, b, r]) => {
          setDepartments(d);
          setBranches(b);
          setRoles(r);
        })
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCreate() {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    if (form.audienceType !== 'ALL' && !form.audienceId) {
      toast.error('Select the audience');
      return;
    }

    startTransition(async () => {
      const result = await createAnnouncement({
        title: form.title,
        body: form.body,
        category: form.category,
        priority: form.priority as any,
        audienceType: form.audienceType as any,
        audienceId: form.audienceType === 'ALL' ? undefined : form.audienceId,
        expiresAt: form.expiresAt || undefined,
        requiresAck: form.requiresAck,
        pinned: form.pinned,
        publishNow: form.publishNow,
      });

      if (result.success) {
        toast.success(result.message);
        setCreateOpen(false);
        setForm(emptyForm);
        load();
      } else {
        toast.error(result.error || 'Failed to create the announcement');
      }
    });
  }

  function publish(id: string) {
    startTransition(async () => {
      const result = await publishAnnouncement(id);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to publish');
      }
    });
  }

  function acknowledge(id: string) {
    startTransition(async () => {
      const result = await acknowledgeAnnouncement(id);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to acknowledge');
      }
    });
  }

  function openAckReport(id: string) {
    startTransition(async () => {
      try {
        setAckReport(await getAnnouncementAcknowledgements(id));
      } catch (e: any) {
        toast.error(e.message || 'Failed to load the report');
      }
    });
  }

  const audienceOptions =
    form.audienceType === 'DEPARTMENT'
      ? departments
      : form.audienceType === 'BRANCH'
        ? branches
        : form.audienceType === 'ROLE'
          ? roles
          : [];

  const needingAck = mine.filter((a) => a.needsAcknowledgement);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/hr" className="text-sm text-muted-foreground hover:underline">
              Human Resources
            </Link>
            <span className="text-muted-foreground">/</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Announcements</h1>
          <p className="text-muted-foreground">Company notices, policy updates and events.</p>
        </div>
        {canAnnounce && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Announcement
          </Button>
        )}
      </div>

      {needingAck.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-center gap-3 py-4 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
            <span>
              You have <strong>{needingAck.length}</strong> notice(s) waiting for your
              acknowledgement.
            </span>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="feed">
        <TabsList>
          <TabsTrigger value="feed">
            My Feed
            <Badge variant="secondary" className="ml-2">
              {mine.length}
            </Badge>
          </TabsTrigger>
          {canAnnounce && (
            <TabsTrigger value="manage">
              Manage
              <Badge variant="secondary" className="ml-2">
                {all.length}
              </Badge>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Feed */}
        <TabsContent value="feed" className="mt-4 space-y-4">
          {mine.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {isPending ? 'Loading…' : 'No announcements right now.'}
              </CardContent>
            </Card>
          )}
          {mine.map((announcement) => (
            <Card
              key={announcement.id}
              className={announcement.pinned ? 'border-primary/40' : undefined}
            >
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                      {announcement.pinned && <Pin className="h-4 w-4 text-primary" />}
                      {announcement.title}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {announcement.author} ·{' '}
                      {announcement.publishedAt
                        ? formatDateTime(announcement.publishedAt)
                        : 'unpublished'}
                      {announcement.expiresAt && ` · expires ${formatDate(announcement.expiresAt)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={PRIORITY_VARIANT[announcement.priority] ?? 'default'}>
                      {announcement.priority}
                    </Badge>
                    <Badge variant="outline">{announcement.category}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="whitespace-pre-wrap text-sm">{announcement.body}</p>
                {announcement.attachmentUrl && (
                  <a
                    href={announcement.attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    View attachment
                  </a>
                )}
                {announcement.requiresAck && (
                  <div className="flex items-center gap-3 border-t pt-3">
                    {announcement.acknowledgedAt ? (
                      <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" />
                        Acknowledged {formatDateTime(announcement.acknowledgedAt)}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => acknowledge(announcement.id)}
                        disabled={isPending}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Acknowledge
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Manage */}
        {canAnnounce && (
          <TabsContent value="manage" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Megaphone className="h-5 w-5" />
                  All Announcements
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Audience</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Published</TableHead>
                      <TableHead className="text-right">Acknowledged</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {all.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                          {isPending ? 'Loading…' : 'No announcements created yet'}
                        </TableCell>
                      </TableRow>
                    )}
                    {all.map((announcement) => (
                      <TableRow key={announcement.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5 font-medium">
                            {announcement.pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                            {announcement.title}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {announcement.author} · {announcement.category}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {announcement.audienceType.replace('_', ' ')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={PRIORITY_VARIANT[announcement.priority] ?? 'default'}>
                            {announcement.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {announcement.isPublished ? (
                            formatDate(announcement.publishedAt)
                          ) : (
                            <Badge variant="secondary">Draft</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {announcement.requiresAck ? announcement.acknowledgementCount : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {!announcement.isPublished && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => publish(announcement.id)}
                                disabled={isPending}
                                title="Publish"
                              >
                                <Send className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {announcement.requiresAck && announcement.isPublished && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openAckReport(announcement.id)}
                                title="Acknowledgement report"
                              >
                                <Users className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* New announcement */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Announcement</DialogTitle>
            <DialogDescription>
              Urgent notices also go out by email; everything else stays in-app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="an-title">Title</Label>
              <Input
                id="an-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Updated leave policy effective October"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="an-body">Body</Label>
              <Textarea
                id="an-body"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                className="min-h-[140px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="an-cat">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger id="an-cat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="an-priority">Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger id="an-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="an-audtype">Audience</Label>
                <Select
                  value={form.audienceType}
                  onValueChange={(v) => setForm({ ...form, audienceType: v, audienceId: '' })}
                >
                  <SelectTrigger id="an-audtype">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Everyone</SelectItem>
                    <SelectItem value="DEPARTMENT">A department</SelectItem>
                    <SelectItem value="BRANCH">A branch</SelectItem>
                    <SelectItem value="ROLE">A role</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.audienceType !== 'ALL' && (
                <div className="space-y-2">
                  <Label htmlFor="an-audid">Select</Label>
                  <Select
                    value={form.audienceId}
                    onValueChange={(v) => setForm({ ...form, audienceId: v })}
                  >
                    <SelectTrigger id="an-audid">
                      <SelectValue placeholder="Choose" />
                    </SelectTrigger>
                    <SelectContent>
                      {audienceOptions.map((option: any) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="an-expires">Expires On</Label>
              <Input
                id="an-expires"
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              />
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.requiresAck}
                  onCheckedChange={(v) => setForm({ ...form, requiresAck: v })}
                />
                Require acknowledgement
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.pinned}
                  onCheckedChange={(v) => setForm({ ...form, pinned: v })}
                />
                Pin to the top of the feed
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.publishNow}
                  onCheckedChange={(v) => setForm({ ...form, publishNow: v })}
                />
                Publish immediately
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.publishNow ? 'Publish' : 'Save Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Acknowledgement report */}
      <Dialog open={Boolean(ackReport)} onOpenChange={(open) => !open && setAckReport(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {ackReport && (
            <>
              <DialogHeader>
                <DialogTitle>{ackReport.title}</DialogTitle>
                <DialogDescription>
                  {ackReport.acknowledgedCount} of {ackReport.audienceSize} acknowledged
                </DialogDescription>
              </DialogHeader>

              <Progress
                value={
                  ackReport.audienceSize > 0
                    ? (ackReport.acknowledgedCount / ackReport.audienceSize) * 100
                    : 0
                }
                className="h-2"
              />

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Acknowledged</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ackReport.rows.map((row: any) => (
                    <TableRow key={row.staffId}>
                      <TableCell>
                        <div className="font-medium">{row.name}</div>
                        <div className="text-xs text-muted-foreground">{row.employeeId}</div>
                      </TableCell>
                      <TableCell className="text-sm">{row.department}</TableCell>
                      <TableCell>
                        {row.acknowledgedAt ? (
                          <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {formatDateTime(row.acknowledgedAt)}
                          </span>
                        ) : (
                          <Badge variant="warning">Pending</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
