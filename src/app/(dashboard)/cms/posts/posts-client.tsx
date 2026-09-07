'use client';

import { useEffect, useState, useTransition } from 'react';
import { Newspaper, Plus, Loader2, Send, Archive, Trash2, Pencil, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/utils';
import {
  getBlogPosts, getBlogPost, saveBlogPost, setPostStatus, deleteBlogPost,
} from '@/actions/cms.actions';
import type { SessionUser } from '@/types';

interface PostsClientProps {
  user: SessionUser;
}

const STATUS_VARIANT: Record<string, any> = {
  DRAFT: 'secondary',
  SCHEDULED: 'info',
  PUBLISHED: 'success',
  ARCHIVED: 'warning',
};

const CATEGORIES = ['GENERAL', 'NEWS', 'INSIGHT', 'PRODUCT'];

const emptyPost = {
  id: undefined as string | undefined,
  title: '',
  slug: '',
  excerpt: '',
  body: '',
  coverImage: '',
  category: 'GENERAL',
  seoDescription: '',
};

export function PostsClient({ user }: PostsClientProps) {
  const [posts, setPosts] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(emptyPost);
  const [isPending, startTransition] = useTransition();

  const canWrite = user.permissions.includes('CMS:POST_MANAGE');
  const canPublish = user.permissions.includes('CMS:PUBLISH');

  function load() {
    startTransition(async () => {
      try {
        setPosts(await getBlogPosts({ status: statusFilter }));
      } catch (e: any) {
        toast.error(e.message || 'Failed to load posts');
      }
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  function openNew() {
    setForm(emptyPost);
    setEditorOpen(true);
  }

  function openEdit(id: string) {
    startTransition(async () => {
      try {
        const post = await getBlogPost(id);
        setForm({
          id: post.id,
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt ?? '',
          body: post.body,
          coverImage: post.coverImage ?? '',
          category: post.category,
          seoDescription: post.seoDescription ?? '',
        });
        setEditorOpen(true);
      } catch (e: any) {
        toast.error(e.message || 'Failed to open the post');
      }
    });
  }

  function save() {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('A title and body are required');
      return;
    }
    startTransition(async () => {
      const result = await saveBlogPost({
        id: form.id,
        title: form.title,
        slug: form.slug || undefined,
        excerpt: form.excerpt || undefined,
        body: form.body,
        coverImage: form.coverImage || undefined,
        category: form.category,
        seoDescription: form.seoDescription || undefined,
      });
      if (result.success) {
        toast.success(result.message);
        setEditorOpen(false);
        load();
      } else {
        toast.error(result.error || 'Failed to save');
      }
    });
  }

  function changeStatus(id: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
    startTransition(async () => {
      const result = await setPostStatus(id, status);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to update');
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteBlogPost(id);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to delete');
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Blog Posts</h1>
          <p className="text-muted-foreground">
            Published posts appear on the website&rsquo;s blog page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {['DRAFT', 'PUBLISHED', 'ARCHIVED'].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canWrite && (
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              New Post
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Newspaper className="h-5 w-5" />
            Posts
            <Badge variant="secondary">{posts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    {isPending
                      ? 'Loading…'
                      : 'No posts yet. The website blog shows "Coming Soon" until one is published.'}
                  </TableCell>
                </TableRow>
              )}
              {posts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell>
                    <div className="font-medium">{post.title}</div>
                    <div className="font-mono text-xs text-muted-foreground">/{post.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[11px]">{post.category}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{post.authorName}</TableCell>
                  <TableCell className="text-sm">
                    {post.publishedAt ? formatDate(post.publishedAt) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[post.status] ?? 'default'}>{post.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      {canWrite && (
                        <Button size="sm" variant="ghost" onClick={() => openEdit(post.id)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canPublish && post.status !== 'PUBLISHED' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => changeStatus(post.id, 'PUBLISHED')}
                          title="Publish to the website"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canPublish && post.status === 'PUBLISHED' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => changeStatus(post.id, 'ARCHIVED')}
                          title="Take off the website"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canWrite && post.status !== 'PUBLISHED' && (
                        <Button size="sm" variant="ghost" onClick={() => remove(post.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
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

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit Post' : 'New Post'}</DialogTitle>
            <DialogDescription>
              Saving creates a draft. Publishing is a separate step.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="p-title">Title</Label>
              <Input
                id="p-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Five things to know before taking a business loan"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="p-slug">Web address</Label>
                <Input
                  id="p-slug"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="Generated from the title"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-cat">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger id="p-cat"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="p-excerpt">
                Excerpt <span className="font-normal text-muted-foreground">— shown on the blog listing, required to publish</span>
              </Label>
              <Textarea
                id="p-excerpt"
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="p-cover">Cover image URL</Label>
              <Input
                id="p-cover"
                value={form.coverImage}
                onChange={(e) => setForm({ ...form, coverImage: e.target.value })}
                placeholder="https://…"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="p-body">Body</Label>
              <Textarea
                id="p-body"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={14}
                className="font-mono text-xs"
                placeholder="Write the post here. Blank lines separate paragraphs."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="p-seo">Search description</Label>
              <Input
                id="p-seo"
                value={form.seoDescription}
                onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
                placeholder="How this post appears in search results"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.id ? 'Save Changes' : 'Create Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
