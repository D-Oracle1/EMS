'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import {
  KeyRound, Copy, Check, AlertTriangle, Loader2, Table2, Lock, Users, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  issueLoginDetails, getLoginDirectory,
  type IssuedLogin, type LoginDirectoryEntry,
} from '@/actions/auth.actions';

export interface LoginCandidate {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  email: string;
  status: string;
  lastLoginAt?: string | Date | null;
  role?: { name: string } | null;
  branch?: { name: string } | null;
}

type Mode = 'existing' | 'issue';

interface LoginDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Staff to choose from. Omit to show `results` only (e.g. after creating one). */
  staff?: LoginCandidate[];
  /** Details already issued elsewhere, shown straight away. */
  results?: IssuedLogin[] | null;
  /** The signed-in admin, who cannot reissue their own password here. */
  currentUserId: string;
}

/** What a message or table row needs, from either an issue or the directory. */
interface Sendable {
  name: string;
  employeeId: string;
  email: string;
  role: string | null;
  branch: string | null;
  tempPassword: string;
}

const loginUrl = () => (typeof window === 'undefined' ? '' : `${window.location.origin}/login`);

/** One person's details as a message ready to paste into WhatsApp, SMS or email. */
function asMessage(r: Sendable) {
  return [
    `Hello ${r.name.split(' ')[0]}, here are your Hy-Link Finance login details:`,
    `Login page: ${loginUrl()}`,
    `Email: ${r.email}`,
    `Temporary password: ${r.tempPassword}`,
    `You will be asked to set your own password when you first sign in.`,
  ].join('\n');
}

/** Rows as tab-separated values, which paste into Excel or Sheets as a table. */
function asSpreadsheet(rows: Sendable[]) {
  const head = ['Name', 'Employee ID', 'Role', 'Branch', 'Email', 'Temporary password'];
  const body = rows.map((r) => [r.name, r.employeeId, r.role ?? '', r.branch ?? '', r.email, r.tempPassword]);
  return [head, ...body].map((cols) => cols.join('\t')).join('\n');
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
    return true;
  } catch {
    toast.error('Could not copy. Select the text and copy it manually.');
    return false;
  }
}

function CopyButton({ onCopy }: { onCopy: () => Promise<boolean> }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        if (await onCopy()) {
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        }
      }}
    >
      {done
        ? <><Check className="mr-1 h-4 w-4 text-emerald-600" />Copied</>
        : <><Copy className="mr-1 h-4 w-4" />Copy</>}
    </Button>
  );
}

const matches = (q: string, values: (string | null | undefined)[]) =>
  !q || values.some((v) => (v ?? '').toLowerCase().includes(q));

export function LoginDetailsDialog({
  open, onOpenChange, staff, results: initialResults, currentUserId,
}: LoginDetailsDialogProps) {
  const [mode, setMode] = useState<Mode>('existing');
  const [results, setResults] = useState<IssuedLogin[] | null>(initialResults ?? null);
  const [directory, setDirectory] = useState<LoginDirectoryEntry[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [onlyNew, setOnlyNew] = useState(true);
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  const q = search.trim().toLowerCase();
  const resultsOnly = !staff;

  // Everyone who can be issued details: not the admin themselves, not terminated.
  const eligible = useMemo(
    () => (staff ?? []).filter((s) => s.id !== currentUserId && s.status !== 'TERMINATED'),
    [staff, currentUserId]
  );

  const visibleCandidates = useMemo(
    () => eligible.filter((s) =>
      (!onlyNew || !s.lastLoginAt) &&
      matches(q, [s.firstName, s.lastName, s.employeeId, s.email, s.branch?.name])),
    [eligible, onlyNew, q]
  );

  const visibleDirectory = useMemo(
    () => (directory ?? []).filter((d) => matches(q, [d.name, d.employeeId, d.email, d.branch, d.role])),
    [directory, q]
  );

  const loadDirectory = async () => {
    setLoadingDirectory(true);
    const result = await getLoginDirectory();
    setLoadingDirectory(false);
    if (result.success && result.data) setDirectory(result.data);
    else toast.error(result.error || 'Failed to load accounts');
  };

  // Each time it opens: the directory first, with nobody picked to reissue.
  useEffect(() => {
    if (!open) return;
    setResults(initialResults ?? null);
    setMode('existing');
    setSelected(new Set(eligible.filter((s) => !s.lastLoginAt).map((s) => s.id)));
    setOnlyNew(true);
    setSearch('');
    setDirectory(null);
    if (!resultsOnly) loadDirectory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setResults(null);
    if (next === 'existing') loadDirectory();
  };

  /** From a directory row straight to reissuing just that person. */
  const issueFor = (staffId: string) => {
    setSelected(new Set([staffId]));
    setOnlyNew(false);
    setSearch('');
    setMode('issue');
  };

  const selectedActive = eligible.filter((s) => selected.has(s.id) && s.lastLoginAt).length;
  const allVisibleSelected = visibleCandidates.length > 0 && visibleCandidates.every((s) => selected.has(s.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of visibleCandidates) {
        if (allVisibleSelected) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });

  const issue = () => {
    startTransition(async () => {
      const result = await issueLoginDetails(Array.from(selected));
      if (result.success && result.data) {
        setResults(result.data);
        toast.success(result.message);
      } else {
        toast.error(result.error || 'Failed to issue login details');
      }
    });
  };

  const pending = (directory ?? []).filter((d) => d.state === 'PENDING' && d.tempPassword) as (LoginDirectoryEntry & { tempPassword: string })[];
  const counts = {
    pending: pending.length,
    own: (directory ?? []).filter((d) => d.state === 'OWN_PASSWORD').length,
    notSaved: (directory ?? []).filter((d) => d.state === 'NOT_SAVED').length,
  };

  const showingResults = !!results;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Login details
          </DialogTitle>
          <DialogDescription>
            {showingResults
              ? 'Copy these and send each person their own. Each temporary password stays visible under Existing accounts until the person sets their own, then it is erased.'
              : mode === 'existing'
                ? 'Every staff account. A temporary password is shown until its owner signs in and sets their own; after that it is erased and cannot be shown. Viewing this list is recorded in the audit log.'
                : 'Issue a new temporary password to each person you pick. Each must set their own at first sign-in.'}
          </DialogDescription>
        </DialogHeader>

        {!resultsOnly && !showingResults && (
          <Tabs value={mode} onValueChange={(v) => switchMode(v as Mode)}>
            <TabsList>
              <TabsTrigger value="existing" className="gap-1.5"><Users className="h-4 w-4" />Existing accounts</TabsTrigger>
              <TabsTrigger value="issue" className="gap-1.5"><Send className="h-4 w-4" />Issue new</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {showingResults ? (
          /* ── Just issued ───────────────────────────────────────────── */
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => copy(results!.map(asMessage).join('\n\n'), 'All login details')}>
                <Copy className="mr-2 h-4 w-4" />Copy all as messages
              </Button>
              <Button size="sm" variant="outline" onClick={() => copy(asSpreadsheet(results!), 'Table')}>
                <Table2 className="mr-2 h-4 w-4" />Copy as table (Excel / Sheets)
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email (username)</TableHead>
                    <TableHead>Temporary password</TableHead>
                    <TableHead className="text-right">Send</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results!.map((r) => (
                    <TableRow key={r.staffId}>
                      <TableCell>
                        <div className="text-sm font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[r.employeeId, r.role, r.branch].filter(Boolean).join(' · ')}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.email}</TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-2 py-1 font-mono text-sm select-all">{r.tempPassword}</code>
                      </TableCell>
                      <TableCell className="text-right">
                        <CopyButton onCopy={() => copy(asMessage(r), `${r.name}'s details`)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : mode === 'existing' ? (
          /* ── Existing accounts ─────────────────────────────────────── */
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Input
                placeholder="Search name, ID, email, branch..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="sm:w-72"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={pending.length === 0}
                  onClick={() => copy(pending.map(asMessage).join('\n\n'), 'Pending login details')}
                >
                  <Copy className="mr-2 h-4 w-4" />Copy pending as messages
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending.length === 0}
                  onClick={() => copy(asSpreadsheet(pending), 'Table')}
                >
                  <Table2 className="mr-2 h-4 w-4" />Copy pending as table
                </Button>
              </div>
            </div>

            {directory && (
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="warning">{counts.pending} waiting for first sign-in</Badge>
                <Badge variant="success">{counts.own} using their own password</Badge>
                {counts.notSaved > 0 && <Badge variant="secondary">{counts.notSaved} temporary password not saved</Badge>}
              </div>
            )}

            <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
              {loadingDirectory && !directory ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading accounts...
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email (username)</TableHead>
                      <TableHead>Password</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleDirectory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No accounts match.</TableCell>
                      </TableRow>
                    ) : (
                      visibleDirectory.map((d) => (
                        <TableRow key={d.staffId}>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-sm font-medium">
                              {d.name}
                              {d.locked && <Lock className="h-3.5 w-3.5 text-rose-600" aria-label="Locked out" />}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {[d.employeeId, d.role, d.branch ?? 'Head office'].filter(Boolean).join(' · ')}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{d.email}</TableCell>
                          <TableCell>
                            {d.state === 'PENDING' && d.tempPassword ? (
                              <code className="rounded bg-muted px-2 py-1 font-mono text-sm select-all">{d.tempPassword}</code>
                            ) : d.state === 'OWN_PASSWORD' ? (
                              <span className="text-xs text-muted-foreground">Set by staff — cannot be shown</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not saved — issue a new one</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {d.state === 'PENDING' && d.tempPassword && (
                              <CopyButton onCopy={() => copy(asMessage({ ...d, tempPassword: d.tempPassword! }), `${d.name}'s details`)} />
                            )}
                            {d.staffId !== currentUserId && (
                              <Button size="sm" variant="ghost" onClick={() => issueFor(d.staffId)}>
                                <Send className="mr-1 h-4 w-4" />Issue new
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        ) : (
          /* ── Issue new ─────────────────────────────────────────────── */
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Input
                placeholder="Search name, ID, email, branch..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="sm:w-72"
              />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={onlyNew} onCheckedChange={(v) => setOnlyNew(v === true)} />
                Only staff who have never signed in
              </label>
            </div>

            <div className="max-h-[45vh] overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} aria-label="Select all shown" />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role · Branch</TableHead>
                    <TableHead>Sign-in</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleCandidates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        {onlyNew ? 'Everyone has signed in at least once. Untick the filter to reissue someone.' : 'No staff match.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleCandidates.map((s) => (
                      <TableRow key={s.id} className="cursor-pointer" onClick={() => toggle(s.id)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} aria-label={`Select ${s.firstName}`} />
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{s.firstName} {s.lastName}</div>
                          <div className="text-xs text-muted-foreground">{s.employeeId} · {s.email}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {[s.role?.name, s.branch?.name ?? 'Head office'].filter(Boolean).join(' · ')}
                        </TableCell>
                        <TableCell>
                          {s.lastLoginAt
                            ? <Badge variant="secondary">Has signed in</Badge>
                            : <Badge variant="warning">Never signed in</Badge>}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {selectedActive > 0 && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {selectedActive} selected {selectedActive === 1 ? 'person has' : 'people have'} already signed in.
                Their current password will stop working and they will need the new one you send.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {showingResults && !resultsOnly && (
            <Button variant="outline" onClick={() => switchMode('existing')}>View all accounts</Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {showingResults ? 'Done' : 'Close'}
          </Button>
          {!showingResults && mode === 'issue' && (
            <Button onClick={issue} disabled={isPending || selected.size === 0}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Issue details for {selected.size} staff
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
