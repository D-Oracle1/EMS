import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Public content feed for the marketing site.
 *
 * Returns the published copy slots as a flat key/value map, so the static site
 * can do `content['home.hero.title']` without knowing anything about our schema.
 *
 * Deliberately open (CORS *) and cached: this is the same copy any visitor can
 * already read on the website, and it must survive the site being served from
 * a different origin.
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

export async function GET() {
  try {
    const blocks = await prisma.contentBlock.findMany({
      where: { isPublished: true },
      select: { key: true, value: true },
    });

    const content: Record<string, string> = {};
    for (const block of blocks) content[block.key] = block.value;

    return NextResponse.json({ content, count: blocks.length }, { headers: CORS });
  } catch (error) {
    console.error('Public content feed failed:', error);
    // The website must still render if we are down, so hand back an empty map
    // rather than an error the page has to special-case.
    return NextResponse.json({ content: {}, count: 0 }, { status: 200, headers: CORS });
  }
}
