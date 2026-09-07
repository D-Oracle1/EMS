import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Public blog feed for the marketing site. Published posts only, newest first.
 * Pass ?slug=... for a single post including its body.
 */
export const revalidate = 60;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get('slug');

    if (slug) {
      const post = await prisma.blogPost.findFirst({
        where: { slug, status: 'PUBLISHED' },
        select: {
          slug: true, title: true, excerpt: true, body: true, coverImage: true,
          category: true, tags: true, publishedAt: true, authorName: true,
          seoTitle: true, seoDescription: true,
        },
      });
      if (!post) {
        return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS });
      }
      return NextResponse.json({ post }, { headers: CORS });
    }

    const posts = await prisma.blogPost.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 50,
      select: {
        slug: true, title: true, excerpt: true, coverImage: true,
        category: true, tags: true, publishedAt: true, authorName: true,
      },
    });

    return NextResponse.json({ posts, count: posts.length }, { headers: CORS });
  } catch (error) {
    console.error('Public posts feed failed:', error);
    return NextResponse.json({ posts: [], count: 0 }, { status: 200, headers: CORS });
  }
}
