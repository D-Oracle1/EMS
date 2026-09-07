'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Network, ChevronRight, ChevronDown, Users, Search, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getOrgChart } from '@/actions/hr-analytics.actions';
import type { SessionUser } from '@/types';

interface OrgChartClientProps {
  user: SessionUser;
}

interface OrgNode {
  id: string;
  employeeId: string;
  name: string;
  jobTitle: string | null;
  roleName: string;
  department: string;
  branch: string | null;
  profilePhoto: string | null;
  status: string;
  directReports: number;
  totalReports: number;
  children: OrgNode[];
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

/** Does this node, or anything beneath it, match the filter? */
function matchesSearch(node: OrgNode, needle: string): boolean {
  if (!needle) return true;
  const haystack = [node.name, node.employeeId, node.jobTitle, node.roleName, node.department]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (haystack.includes(needle)) return true;
  return node.children.some((child) => matchesSearch(child, needle));
}

function OrgNodeRow({
  node,
  depth,
  search,
  expandedIds,
  onToggle,
  currentUserId,
}: {
  node: OrgNode;
  depth: number;
  search: string;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  currentUserId: string;
}) {
  if (!matchesSearch(node, search)) return null;

  const hasChildren = node.children.length > 0;
  // A search auto-expands so matches deeper in the tree stay reachable.
  const isExpanded = search ? true : expandedIds.has(node.id);
  const isCurrentUser = node.id === currentUserId;

  return (
    <div>
      <div
        className={`flex items-center gap-3 rounded-md border p-3 transition-colors ${
          isCurrentUser ? 'border-primary/50 bg-primary/5' : 'hover:bg-accent/40'
        }`}
        style={{ marginLeft: depth * 24 }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggle(node.id)}
          className={`shrink-0 rounded p-0.5 ${
            hasChildren ? 'hover:bg-accent' : 'invisible'
          }`}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <Avatar className="h-9 w-9 shrink-0">
          {node.profilePhoto && <AvatarImage src={node.profilePhoto} alt={node.name} />}
          <AvatarFallback className="text-xs">{initials(node.name)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{node.name}</span>
            {isCurrentUser && (
              <Badge variant="outline" className="text-[10px]">
                you
              </Badge>
            )}
            {node.status !== 'ACTIVE' && (
              <Badge variant="secondary" className="text-[10px]">
                {node.status.replace('_', ' ').toLowerCase()}
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {node.jobTitle ?? node.roleName} · {node.department}
            {node.branch ? ` · ${node.branch}` : ''}
          </p>
        </div>

        {node.directReports > 0 && (
          <div className="shrink-0 text-right">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span className="tabular-nums">{node.directReports}</span>
              {node.totalReports !== node.directReports && (
                <span className="tabular-nums text-muted-foreground/60">
                  ({node.totalReports})
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div className="mt-1.5 space-y-1.5 border-l border-dashed border-muted pl-0">
          {node.children.map((child) => (
            <OrgNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              search={search}
              expandedIds={expandedIds}
              onToggle={onToggle}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function OrgChartClient({ user }: OrgChartClientProps) {
  const [chart, setChart] = useState<{
    roots: OrgNode[];
    unassigned: number;
    totalStaff: number;
    maxDepth: number;
  } | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const data = await getOrgChart();
        setChart(data);
        // Open the first two levels by default so the shape is visible at a glance.
        const initial = new Set<string>();
        for (const root of data.roots) {
          initial.add(root.id);
          for (const child of root.children) initial.add(child.id);
        }
        setExpandedIds(initial);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load the org chart');
      }
    });
  }, []);

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    if (!chart) return;
    const all = new Set<string>();
    const walk = (node: OrgNode) => {
      all.add(node.id);
      node.children.forEach(walk);
    };
    chart.roots.forEach(walk);
    setExpandedIds(all);
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Link href="/hr" className="text-sm text-muted-foreground hover:underline">
            Human Resources
          </Link>
          <span className="text-muted-foreground">/</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Organisation Chart</h1>
        <p className="text-muted-foreground">
          The reporting structure, built from each staff member&rsquo;s supervisor.
        </p>
      </div>

      {chart && (
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            { label: 'Staff in Chart', value: chart.totalStaff, icon: Users },
            { label: 'Top-level Nodes', value: chart.roots.length, icon: Network },
            { label: 'Depth', value: chart.maxDepth + 1, icon: Layers },
            { label: 'No Supervisor', value: chart.unassigned, icon: Users },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums">{stat.value}</p>
                    </div>
                    <span className="rounded-lg bg-muted p-2 text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {chart && chart.unassigned > 1 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          {chart.unassigned} staff members have no supervisor set, so they each appear as a separate
          root. Set supervisors in the People Directory to consolidate the chart.
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, employee ID, title or department…"
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Network className="h-5 w-5" />
            Reporting Structure
          </CardTitle>
          <button
            type="button"
            onClick={expandAll}
            className="text-sm text-muted-foreground hover:underline"
          >
            Expand all
          </button>
        </CardHeader>
        <CardContent className="space-y-2 overflow-x-auto">
          {!chart && (
            <p className="py-12 text-center text-muted-foreground">
              {isPending ? 'Building the chart…' : 'No data'}
            </p>
          )}
          {chart?.roots.length === 0 && (
            <p className="py-12 text-center text-muted-foreground">No active staff to chart.</p>
          )}
          {chart?.roots.map((root) => (
            <OrgNodeRow
              key={root.id}
              node={root}
              depth={0}
              search={search.trim().toLowerCase()}
              expandedIds={expandedIds}
              onToggle={toggle}
              currentUserId={user.id}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
