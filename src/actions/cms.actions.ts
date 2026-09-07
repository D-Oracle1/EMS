'use server';

/**
 * CMS — Server Actions
 * Hylink Finance Limited EMS
 *
 * Content for the public marketing site, owned by the IT department. Two things
 * are managed here: the editable copy slots on the existing pages
 * (ContentBlock) and the blog (BlogPost).
 *
 * Every change is recorded in ContentRevision, because this content is publicly
 * visible — a bad edit needs to be traceable to a person and revertible.
 */

import { prisma } from '@/lib/prisma';
import { requirePermission, requireAnyPermission } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import type { ActionResult } from '@/types';

const CMS_READ = ['CMS:READ', 'CMS:CONTENT_MANAGE', 'CMS:POST_MANAGE', 'CMS:PUBLISH'];

/** Record a field-level change so the public site's history is traceable. */
async function recordRevision(params: {
  entityType: 'CONTENT_BLOCK' | 'BLOG_POST';
  entityId: string;
  entityLabel: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedById: string;
}): Promise<void> {
  if (params.oldValue === params.newValue) return;
  try {
    await prisma.contentRevision.create({ data: params });
  } catch (error) {
    // History must never block the edit itself.
    console.error('Failed to record content revision:', error);
  }
}

// ============================================================================
// CONTENT BLOCKS
// ============================================================================

export async function getContentBlocks(page?: string) {
  await requireAnyPermission(CMS_READ);

  const blocks = await prisma.contentBlock.findMany({
    where: page && page !== 'ALL' ? { page } : {},
    orderBy: [{ page: 'asc' }, { sortOrder: 'asc' }],
    include: { updatedBy: { select: { firstName: true, lastName: true } } },
  });

  return blocks.map((b) => ({
    id: b.id,
    key: b.key,
    page: b.page,
    label: b.label,
    description: b.description,
    type: b.type,
    value: b.value,
    defaultValue: b.defaultValue,
    isPublished: b.isPublished,
    isModified: b.defaultValue !== null && b.value !== b.defaultValue,
    updatedBy: b.updatedBy ? `${b.updatedBy.firstName} ${b.updatedBy.lastName}` : null,
    updatedAt: b.updatedAt,
    sortOrder: b.sortOrder,
  }));
}

export async function updateContentBlocks(
  updates: Array<{ id: string; value: string }>
): Promise<ActionResult<{ updated: number }>> {
  try {
    const user = await requirePermission('CMS:CONTENT_MANAGE');

    if (updates.length === 0) return { success: false, error: 'No changes supplied' };

    const blocks = await prisma.contentBlock.findMany({
      where: { id: { in: updates.map((u) => u.id) } },
    });
    const byId = new Map(blocks.map((b) => [b.id, b]));

    // Validate everything before writing anything.
    for (const update of updates) {
      const block = byId.get(update.id);
      if (!block) return { success: false, error: 'One of the content blocks no longer exists' };
      if (update.value.length > 5000) {
        return { success: false, error: `"${block.label}" is too long (5000 characters max)` };
      }
      if (block.type === 'URL' && update.value && !/^https?:\/\//i.test(update.value)) {
        return { success: false, error: `"${block.label}" must be a full URL starting with http` };
      }
      if (block.type === 'NUMBER' && update.value && !/^-?\d+(\.\d+)?$/.test(update.value.trim())) {
        return { success: false, error: `"${block.label}" must be a number` };
      }
    }

    let changed = 0;
    for (const update of updates) {
      const block = byId.get(update.id)!;
      if (block.value === update.value) continue;

      await prisma.contentBlock.update({
        where: { id: update.id },
        data: { value: update.value, updatedById: user.id },
      });
      await recordRevision({
        entityType: 'CONTENT_BLOCK',
        entityId: block.id,
        entityLabel: block.label,
        field: 'value',
        oldValue: block.value,
        newValue: update.value,
        changedById: user.id,
      });
      changed++;
    }

    if (changed === 0) return { success: false, error: 'Nothing changed' };

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'CMS',
      entityType: 'CONTENT_BLOCK',
      description: `Updated ${changed} website content block(s)`,
      changedFields: updates.map((u) => byId.get(u.id)?.key ?? u.id),
    });

    return { success: true, message: `${changed} block(s) updated`, data: { updated: changed } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function revertContentBlock(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('CMS:CONTENT_MANAGE');

    const block = await prisma.contentBlock.findUnique({ where: { id } });
    if (!block) return { success: false, error: 'Content block not found' };
    if (block.defaultValue === null) {
      return { success: false, error: 'This block has no original value to revert to' };
    }
    if (block.value === block.defaultValue) {
      return { success: false, error: 'This block is already at its original value' };
    }

    await prisma.contentBlock.update({
      where: { id },
      data: { value: block.defaultValue, updatedById: user.id },
    });
    await recordRevision({
      entityType: 'CONTENT_BLOCK',
      entityId: id,
      entityLabel: block.label,
      field: 'value',
      oldValue: block.value,
      newValue: block.defaultValue,
      changedById: user.id,
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'CMS',
      entityType: 'CONTENT_BLOCK',
      entityId: id,
      description: `Reverted "${block.label}" to its original value`,
    });

    return { success: true, message: `"${block.label}" reverted` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// BLOG POSTS
// ============================================================================

/** Slugify a title, keeping it URL-safe and stable. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

export async function getBlogPosts(filters?: { status?: string; search?: string }) {
  await requireAnyPermission(CMS_READ);

  const where: Record<string, unknown> = {};
  if (filters?.status && filters.status !== 'ALL') where.status = filters.status;
  if (filters?.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const posts = await prisma.blogPost.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  });

  return posts.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    category: p.category,
    tags: p.tags,
    status: p.status,
    coverImage: p.coverImage,
    publishedAt: p.publishedAt,
    scheduledFor: p.scheduledFor,
    authorName: p.authorName,
    viewCount: p.viewCount,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
}

export async function getBlogPost(id: string) {
  await requireAnyPermission(CMS_READ);

  const post = await prisma.blogPost.findUnique({ where: { id } });
  if (!post) throw new Error('Post not found');
  return post;
}

export async function saveBlogPost(data: {
  id?: string;
  title: string;
  slug?: string;
  excerpt?: string;
  body: string;
  coverImage?: string;
  category?: string;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('CMS:POST_MANAGE');

    const title = data.title.trim();
    if (!title) return { success: false, error: 'A title is required' };
    if (!data.body.trim()) return { success: false, error: 'The post body cannot be empty' };
    if (title.length > 200) return { success: false, error: 'Title is too long (200 max)' };

    const slug = (data.slug?.trim() ? slugify(data.slug) : slugify(title)) || `post-${Date.now()}`;

    const clash = await prisma.blogPost.findFirst({
      where: { slug, ...(data.id ? { id: { not: data.id } } : {}) },
      select: { id: true },
    });
    if (clash) {
      return { success: false, error: `The address "${slug}" is already used by another post` };
    }

    const payload = {
      title,
      slug,
      excerpt: data.excerpt?.trim() || null,
      body: data.body,
      coverImage: data.coverImage?.trim() || null,
      category: data.category ?? 'GENERAL',
      tags: data.tags ?? [],
      seoTitle: data.seoTitle?.trim() || null,
      seoDescription: data.seoDescription?.trim() || null,
    };

    if (data.id) {
      const existing = await prisma.blogPost.findUnique({ where: { id: data.id } });
      if (!existing) return { success: false, error: 'Post not found' };

      await prisma.blogPost.update({ where: { id: data.id }, data: payload });
      await recordRevision({
        entityType: 'BLOG_POST',
        entityId: data.id,
        entityLabel: title,
        field: 'body',
        oldValue: existing.body.slice(0, 2000),
        newValue: data.body.slice(0, 2000),
        changedById: user.id,
      });

      await auditLog({
        userId: user.id,
        action: 'UPDATE',
        module: 'CMS',
        entityType: 'BLOG_POST',
        entityId: data.id,
        description: `Edited blog post "${title}"`,
      });

      return { success: true, message: 'Post saved', data: { id: data.id } };
    }

    const post = await prisma.blogPost.create({
      data: {
        ...payload,
        status: 'DRAFT',
        authorId: user.id,
        // Denormalised so the byline survives the author being deactivated.
        authorName: `${user.firstName} ${user.lastName}`,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'CMS',
      entityType: 'BLOG_POST',
      entityId: post.id,
      description: `Created blog post "${title}"`,
    });

    return { success: true, message: 'Draft created', data: { id: post.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function setPostStatus(
  id: string,
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
): Promise<ActionResult> {
  try {
    // Publishing is a separate permission from writing: someone can draft
    // without being able to push it live.
    const user = await requirePermission('CMS:PUBLISH');

    const post = await prisma.blogPost.findUnique({ where: { id } });
    if (!post) return { success: false, error: 'Post not found' };
    if (post.status === status) {
      return { success: false, error: `This post is already ${status.toLowerCase()}` };
    }
    if (status === 'PUBLISHED' && !post.excerpt) {
      return {
        success: false,
        error: 'Add a short excerpt before publishing — it is what shows on the blog listing.',
      };
    }

    await prisma.blogPost.update({
      where: { id },
      data: {
        status,
        // Set the publish date once, on first publish, so re-publishing an
        // archived post does not silently change its date.
        publishedAt: status === 'PUBLISHED' ? (post.publishedAt ?? new Date()) : post.publishedAt,
      },
    });

    await recordRevision({
      entityType: 'BLOG_POST',
      entityId: id,
      entityLabel: post.title,
      field: 'status',
      oldValue: post.status,
      newValue: status,
      changedById: user.id,
    });

    await auditLog({
      userId: user.id,
      action: status === 'PUBLISHED' ? 'APPROVE' : 'UPDATE',
      module: 'CMS',
      entityType: 'BLOG_POST',
      entityId: id,
      description: `Set blog post "${post.title}" to ${status}`,
    });

    return {
      success: true,
      message:
        status === 'PUBLISHED'
          ? `"${post.title}" is now live on the website`
          : `"${post.title}" is now ${status.toLowerCase()}`,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteBlogPost(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('CMS:POST_MANAGE');

    const post = await prisma.blogPost.findUnique({ where: { id } });
    if (!post) return { success: false, error: 'Post not found' };
    if (post.status === 'PUBLISHED') {
      return {
        success: false,
        error: 'Archive the post first — deleting something that is live would break its links.',
      };
    }

    await prisma.blogPost.delete({ where: { id } });

    await auditLog({
      userId: user.id,
      action: 'DELETE',
      module: 'CMS',
      entityType: 'BLOG_POST',
      entityId: id,
      description: `Deleted blog post "${post.title}"`,
    });

    return { success: true, message: `"${post.title}" deleted` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// HISTORY
// ============================================================================

export async function getContentRevisions(limit = 50) {
  await requireAnyPermission(CMS_READ);

  const revisions = await prisma.contentRevision.findMany({
    orderBy: { changedAt: 'desc' },
    take: limit,
    include: { changedBy: { select: { firstName: true, lastName: true } } },
  });

  return revisions.map((r) => ({
    id: r.id,
    entityType: r.entityType,
    entityLabel: r.entityLabel,
    field: r.field,
    oldValue: r.oldValue,
    newValue: r.newValue,
    changedBy: `${r.changedBy.firstName} ${r.changedBy.lastName}`,
    changedAt: r.changedAt,
  }));
}

/** Headline counts for the CMS landing page. */
export async function getCmsOverview() {
  await requireAnyPermission(CMS_READ);

  const [blocks, modified, drafts, published, recentEdits] = await Promise.all([
    prisma.contentBlock.count(),
    prisma.contentBlock.count({ where: { NOT: { defaultValue: null } } }),
    prisma.blogPost.count({ where: { status: 'DRAFT' } }),
    prisma.blogPost.count({ where: { status: 'PUBLISHED' } }),
    prisma.contentRevision.count({
      where: { changedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    }),
  ]);

  return { blocks, modified, drafts, published, recentEdits };
}
