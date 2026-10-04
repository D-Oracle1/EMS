/**
 * Upload tokens for a form's file questions.
 *
 * The browser uploads the file straight to Vercel Blob (so a 10 MB file never
 * passes through a function, whose request body is capped at 4.5 MB). Before
 * it can, it asks here for a short-lived token, and the token is only issued
 * when:
 *  - the form exists and is taking responses,
 *  - a staff form is being answered by signed-in staff,
 *  - the question is a file question on that form,
 *  - the path sits under that question's own prefix (lib/forms fileUploadPrefix),
 * and the token itself limits the file to the question's types and size.
 *
 * PUBLIC: under /api/public so a signed-out visitor answering a public form
 * reaches it.
 */
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import {
  readQuestions, isAcceptingResponses, fileUploadPrefix, allowedFileTypes, FILE_LIMITS,
} from '@/lib/forms';
import type { SessionUser } from '@/types';

export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload: { slug?: unknown; questionId?: unknown };
        try {
          payload = JSON.parse(clientPayload ?? '{}');
        } catch {
          throw new Error('Bad upload request');
        }
        const slug = typeof payload.slug === 'string' ? payload.slug.slice(0, 80) : '';
        const questionId = typeof payload.questionId === 'string' ? payload.questionId.slice(0, 40) : '';

        const form = await prisma.form.findUnique({ where: { slug } });
        if (!form || !isAcceptingResponses(form)) throw new Error('This form is not taking responses');

        if (form.audience === 'STAFF') {
          const session = await auth();
          const user = session?.user as SessionUser | undefined;
          if (!user?.id || (user.userType ?? 'staff') !== 'staff') throw new Error('Sign in to upload');
        }

        const question = readQuestions(form.questions).find((q) => q.id === questionId && q.type === 'FILE');
        if (!question) throw new Error('This question does not take files');

        const prefix = fileUploadPrefix(slug, questionId);
        if (!pathname.startsWith(prefix) || pathname.includes('..') || pathname.length > prefix.length + 120) {
          throw new Error('Bad upload path');
        }

        return {
          allowedContentTypes: allowedFileTypes(question),
          maximumSizeInBytes: (question.maxSizeMb ?? FILE_LIMITS.maxSizeMb) * 1024 * 1024,
          // An unguessable link: the store is public, so the link is the lock.
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload refused' },
      { status: 400 }
    );
  }
}
