'use client';

/**
 * The centred search pill from the reference design.
 *
 * Searches customers, savings accounts and loans, scoped server-side to what
 * the user may see. Cmd/Ctrl-K focuses it from anywhere.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, User, PiggyBank, Landmark } from 'lucide-react';
import { globalSearch, type SearchResult, type SearchResultKind } from '@/actions/search.actions';

const ICON: Record<SearchResultKind, typeof User> = {
  customer: User,
  savings: PiggyBank,
  loan: Landmark,
};

const TINT: Record<SearchResultKind, string> = {
  customer: 'icon-tile-cyan',
  savings: 'icon-tile-emerald',
  loan: 'icon-tile-orange',
};

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);

  // Debounced, and guarded against out-of-order responses: a slow reply for an
  // earlier query must not overwrite the results of a later one.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setBusy(false);
      return;
    }

    let stale = false;
    setBusy(true);
    const id = setTimeout(async () => {
      try {
        const found = await globalSearch(term);
        if (!stale) {
          setResults(found);
          setActive(0);
        }
      } catch {
        if (!stale) setResults([]);
      } finally {
        if (!stale) setBusy(false);
      }
    }, 250);

    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [query]);

  // Cmd/Ctrl-K from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close when the pointer goes elsewhere.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const go = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      setQuery('');
      router.push(result.href);
    },
    [router]
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    }
  }

  const showPanel = open && query.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative mx-auto w-full max-w-xl">
      <div className="glass-panel flex items-center gap-3 rounded-full px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search customers, accounts or loans"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Search"
        />
        {busy ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <kbd className="hidden shrink-0 rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
            ⌘K
          </kbd>
        )}
      </div>

      {showPanel && (
        <div className="glass-panel absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto p-1.5 text-left">
          {results.length === 0 && !busy && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing found for &ldquo;{query.trim()}&rdquo;
            </p>
          )}
          {results.map((result, i) => {
            const Icon = ICON[result.kind];
            return (
              <button
                key={`${result.kind}-${result.id}`}
                onClick={() => go(result)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors ${
                  i === active ? 'bg-foreground/5' : ''
                }`}
              >
                <span className={`icon-tile icon-tile-sm ${TINT[result.kind]}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{result.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {result.subtitle}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
