'use client';

import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { FileText, ImageIcon, Loader2, Paperclip, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fileAccept, fileKindsOf, fileUploadPrefix, formatFileSize, FILE_KIND_LABEL, FILE_LIMITS,
  type FileAnswer, type FormQuestion,
} from '@/lib/forms';

interface FileUploadFieldProps {
  question: FormQuestion;
  /** The form's share slug: uploads go under its folder. Absent in a preview. */
  slug?: string;
  files: FileAnswer[];
  onChange: (files: FileAnswer[]) => void;
  /** Told when uploads start and finish, so the form can hold its submit. */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}

type Pending = { key: string; name: string; percent: number };

/** A storage-safe name that still reads as the original. */
function safeName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return (cleaned || 'file').slice(-80);
}

/**
 * Attaches files to a FILE question. Each file goes straight from the browser
 * to storage the moment it is picked, with a progress bar; the answer holds
 * only the links. The upload route decides whether it is allowed.
 */
export function FileUploadField({ question: q, slug, files, onChange, onBusyChange, disabled }: FileUploadFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const maxFiles = q.maxFiles ?? 1;
  const maxMb = q.maxSizeMb ?? FILE_LIMITS.maxSizeMb;
  const room = maxFiles - files.length - pending.length;
  const kinds = fileKindsOf(q).map((k) => FILE_KIND_LABEL[k]).join(', ');

  const pick = async (list: FileList | null) => {
    if (!list || !slug) return;
    setProblem(null);
    const chosen = Array.from(list);
    if (chosen.length > room) {
      setProblem(`You can attach ${maxFiles} file${maxFiles === 1 ? '' : 's'} here.`);
      chosen.splice(room);
    }
    const tooBig = chosen.filter((f) => f.size > maxMb * 1024 * 1024);
    if (tooBig.length) setProblem(`${tooBig.map((f) => f.name).join(', ')} is over ${maxMb} MB.`);
    const ok = chosen.filter((f) => f.size <= maxMb * 1024 * 1024);
    if (!ok.length) return;

    const jobs = ok.map((file) => ({ file, key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}` }));
    setPending((p) => [...p, ...jobs.map((j) => ({ key: j.key, name: j.file.name, percent: 0 }))]);
    onBusyChange?.(true);

    const done: FileAnswer[] = [];
    await Promise.all(
      jobs.map(async ({ file, key }) => {
        try {
          const blob = await upload(`${fileUploadPrefix(slug, q.id)}${safeName(file.name)}`, file, {
            access: 'public',
            handleUploadUrl: '/api/public/form-upload',
            clientPayload: JSON.stringify({ slug, questionId: q.id }),
            contentType: file.type || undefined,
            onUploadProgress: ({ percentage }) =>
              setPending((p) => p.map((x) => (x.key === key ? { ...x, percent: Math.round(percentage) } : x))),
          });
          done.push({ url: blob.url, name: file.name, size: file.size, type: file.type });
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          setProblem(
            /content type|not allowed/i.test(message)
              ? `${file.name} is not an accepted file type (${kinds}).`
              : `${file.name} could not be uploaded. ${message || 'Please try again.'}`
          );
        } finally {
          setPending((p) => p.filter((x) => x.key !== key));
        }
      })
    );

    onBusyChange?.(false);
    if (done.length) onChange([...files, ...done]);
    if (input.current) input.current.value = '';
  };

  return (
    <div className="space-y-2">
      {files.map((f) => (
        <div key={f.url} className="flex items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2 text-sm">
          {f.type.startsWith('image/') ? (
            <ImageIcon className="h-4 w-4 shrink-0 text-indigo-500" />
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-indigo-500" />
          )}
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatFileSize(f.size)}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(files.filter((x) => x.url !== f.url))}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Remove ${f.name}`}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}

      {pending.map((p) => (
        <div key={p.key} className="rounded-xl border px-3 py-2 text-sm">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-500" />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.percent}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-indigo-500 transition-[width]" style={{ width: `${p.percent}%` }} />
          </div>
        </div>
      ))}

      {room > 0 && (
        <>
          <input
            ref={input}
            type="file"
            accept={fileAccept(q)}
            multiple={maxFiles - files.length > 1}
            className="hidden"
            onChange={(e) => pick(e.target.files)}
            disabled={disabled || !slug}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={disabled || !slug}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 text-sm font-medium text-indigo-700 transition-colors dark:text-indigo-300',
              'border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 dark:border-indigo-500/30 dark:hover:bg-indigo-500/10',
              'disabled:pointer-events-none disabled:opacity-60'
            )}
          >
            <Paperclip className="h-4 w-4" />
            {files.length ? 'Add another file' : maxFiles > 1 ? 'Add files' : 'Add file'}
          </button>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        {kinds} · up to {maxMb} MB each{maxFiles > 1 ? ` · up to ${maxFiles} files` : ''}
      </p>
      {problem && <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{problem}</p>}
    </div>
  );
}
