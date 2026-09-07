'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { LayoutTemplate, Save, RotateCcw, Loader2, ExternalLink, History } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatCard } from '@/components/ui/stat-card';
import { formatDateTime } from '@/lib/utils';
import {
  getContentBlocks,
  updateContentBlocks,
  revertContentBlock,
  getContentRevisions,
  getCmsOverview,
} from '@/actions/cms.actions';
import type { SessionUser } from '@/types';

interface ContentClientProps {
  user: SessionUser;
}

const SITE = 'https://www.hylinkfinance.com';

const PAGE_LABEL: Record<string, string> = {
  home: 'Home page',
  about: 'About us',
  services: 'Services',
  company: 'Company',
  contact: 'Contact',
};

export function ContentClient({ user }: ContentClientProps) {
  const [blocks, setBlocks] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [revisions, setRevisions] = useState<any[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const canEdit = user.permissions.includes('CMS:CONTENT_MANAGE');

  function load() {
    startTransition(async () => {
      try {
        const [b, r, o] = await Promise.all([
          getContentBlocks(),
          getContentRevisions(30),
          getCmsOverview(),
        ]);
        setBlocks(b);
        setRevisions(r);
        setOverview(o);
        setDrafts(Object.fromEntries(b.map((x: any) => [x.id, x.value])));
      } catch (e: any) {
        toast.error(e.message || 'Failed to load site content');
      }
    });
  }

  useEffect(() => {
    load();
  }, []);

  const pages = useMemo(
    () => Array.from(new Set(blocks.map((b) => b.page))).sort(),
    [blocks]
  );

  const changed = useMemo(
    () => blocks.filter((b) => drafts[b.id] !== undefined && drafts[b.id] !== b.value),
    [blocks, drafts]
  );

  function save() {
    if (changed.length === 0) return;
    setSaving(true);
    startTransition(async () => {
      const result = await updateContentBlocks(
        changed.map((b) => ({ id: b.id, value: drafts[b.id] }))
      );
      setSaving(false);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to save');
      }
    });
  }

  function revert(block: any) {
    startTransition(async () => {
      const result = await revertContentBlock(block.id);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to revert');
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Site Content</h1>
          <p className="text-muted-foreground">
            The copy on the public website. Changes go live within a minute.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={SITE} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              View site
            </a>
          </Button>
          {changed.length > 0 && <Badge variant="warning">{changed.length} unsaved</Badge>}
          <Button onClick={save} disabled={!canEdit || changed.length === 0 || saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {overview && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Content Blocks" color="fuchsia" value={overview.blocks} icon={LayoutTemplate} />
          <StatCard title="Published Posts" color="emerald" value={overview.published} icon={LayoutTemplate} />
          <StatCard title="Drafts" color="amber" value={overview.drafts} icon={LayoutTemplate} />
          <StatCard
            title="Edits This Week"
            color="sky"
            value={overview.recentEdits}
            icon={History}
          />
        </div>
      )}

      {pages.length > 0 && (
        <Tabs defaultValue={pages[0]}>
          <TabsList className="flex-wrap">
            {pages.map((page) => (
              <TabsTrigger key={page} value={page}>
                {PAGE_LABEL[page] ?? page}
              </TabsTrigger>
            ))}
            <TabsTrigger value="__history">
              <History className="mr-2 h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          {pages.map((page) => (
            <TabsContent key={page} value={page} className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{PAGE_LABEL[page] ?? page}</CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                  {blocks
                    .filter((b) => b.page === page)
                    .map((block) => {
                      const value = drafts[block.id] ?? block.value;
                      const isDirty = value !== block.value;
                      const isLong = block.type === 'RICHTEXT' || value.length > 90;

                      return (
                        <div key={block.id} className="py-4 first:pt-0 last:pb-0">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <Label htmlFor={block.id} className="flex flex-wrap items-center gap-2">
                              {block.label}
                              {block.isModified && (
                                <Badge variant="secondary" className="text-[10px]">
                                  edited
                                </Badge>
                              )}
                              {isDirty && (
                                <Badge variant="warning" className="text-[10px]">
                                  unsaved
                                </Badge>
                              )}
                            </Label>
                            {block.isModified && canEdit && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => revert(block)}
                                disabled={isPending}
                                title="Revert to the original wording"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>

                          {isLong ? (
                            <Textarea
                              id={block.id}
                              value={value}
                              onChange={(e) =>
                                setDrafts({ ...drafts, [block.id]: e.target.value })
                              }
                              disabled={!canEdit}
                              rows={3}
                            />
                          ) : (
                            <Input
                              id={block.id}
                              value={value}
                              onChange={(e) =>
                                setDrafts({ ...drafts, [block.id]: e.target.value })
                              }
                              disabled={!canEdit}
                            />
                          )}

                          <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                            {block.key}
                            {block.updatedBy ? ` · last edited by ${block.updatedBy}` : ''}
                          </p>
                        </div>
                      );
                    })}
                </CardContent>
              </Card>
            </TabsContent>
          ))}

          <TabsContent value="__history" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Changes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {revisions.length === 0 && (
                  <p className="py-8 text-center text-muted-foreground">
                    No content changes recorded yet.
                  </p>
                )}
                {revisions.map((r) => (
                  <div key={r.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{r.entityLabel}</span>
                      <span className="text-xs text-muted-foreground">
                        {r.changedBy} · {formatDateTime(r.changedAt)}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="rounded bg-rose-50 p-2 text-xs text-rose-800">
                        <span className="font-semibold">Before: </span>
                        {r.oldValue?.slice(0, 160) || '(empty)'}
                      </div>
                      <div className="rounded bg-emerald-50 p-2 text-xs text-emerald-800">
                        <span className="font-semibold">After: </span>
                        {r.newValue?.slice(0, 160) || '(empty)'}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {pages.length === 0 && !isPending && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No content blocks configured. Run the seed to create them.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
