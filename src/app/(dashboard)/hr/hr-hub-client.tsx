'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Users,
  UserPlus,
  UserMinus,
  TrendingDown,
  CalendarCheck,
  Clock,
  Briefcase,
  GraduationCap,
  Laptop,
  Megaphone,
  Network,
  Wallet,
  ClipboardList,
  ArrowRightLeft,
  Cake,
  PartyPopper,
  ChevronRight,
  Settings2,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import {
  getHROverview,
  getHeadcountTrend,
  getUpcomingMilestones,
} from '@/actions/hr-analytics.actions';
import type { SessionUser } from '@/types';

interface HRHubClientProps {
  user: SessionUser;
}

const CHART_COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899'];

interface HRLink {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
  permissions?: string[];
}

const HR_SECTIONS: HRLink[] = [
  { href: '/hr/staff', title: 'People Directory', description: 'Every employee record, profile and document.', icon: Users, permissions: ['HR:STAFF_READ'] },
  { href: '/hr/payroll', title: 'Payroll', description: 'Salary packages, monthly runs and payslips.', icon: Wallet, permissions: ['HR:PAYROLL_MANAGE', 'HR:PAYROLL_READ', 'HR:PAYROLL_APPROVE'] },
  { href: '/hr/recruitment', title: 'Recruitment', description: 'Openings, applicants, interviews and hiring.', icon: Briefcase, permissions: ['HR:RECRUITMENT_MANAGE'] },
  { href: '/hr/onboarding', title: 'Onboarding & Exits', description: 'Joiner and leaver checklists with owners.', icon: ClipboardList, permissions: ['HR:STAFF_UPDATE', 'HR:STAFF_READ'] },
  { href: '/hr/lifecycle', title: 'Movements & Exits', description: 'Promotions, transfers, confirmations, exits.', icon: ArrowRightLeft, permissions: ['HR:STAFF_UPDATE', 'HR:STAFF_READ'] },
  { href: '/hr/training', title: 'Learning', description: 'Training programmes, enrolments and results.', icon: GraduationCap, permissions: ['HR:TRAINING_MANAGE', 'HR:STAFF_READ'] },
  { href: '/hr/assets', title: 'Company Assets', description: 'Custody of laptops, phones and equipment.', icon: Laptop, permissions: ['HR:ASSET_MANAGE', 'HR:STAFF_READ'] },
  { href: '/hr/announcements', title: 'Announcements', description: 'Company notices and acknowledgement tracking.', icon: Megaphone },
  { href: '/hr/org-chart', title: 'Org Chart', description: 'The reporting structure, top to bottom.', icon: Network, permissions: ['HR:STAFF_READ'] },
  { href: '/hr/attendance', title: 'Attendance', description: 'Clock-in records, lateness and the QR code.', icon: Clock },
  { href: '/hr/leave', title: 'Leave', description: 'Requests, approvals and entitlement balances.', icon: CalendarCheck },
  { href: '/hr/settings', title: 'HR Configuration', description: 'Leave types, holidays, shifts, grades, pay components.', icon: Settings2, permissions: ['HR:CONFIG_MANAGE', 'SYSTEM:CONFIG_MANAGE'] },
];

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function HRHubClient({ user }: HRHubClientProps) {
  const [overview, setOverview] = useState<any>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any>(null);
  const [isPending, startTransition] = useTransition();
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      try {
        const [o, t, m] = await Promise.all([
          getHROverview(),
          getHeadcountTrend(12),
          getUpcomingMilestones(30),
        ]);
        setOverview(o);
        setTrend(t);
        setMilestones(m);
      } catch (e: any) {
        if (/permission/i.test(e.message ?? '')) setDenied(true);
        else toast.error(e.message || 'Failed to load HR overview');
      }
    });
  }, []);

  const can = (permissions?: string[]) =>
    !permissions || permissions.some((p) => user.permissions.includes(p));

  const visibleSections = HR_SECTIONS.filter((section) => can(section.permissions));

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Human Resources</h1>
        <p className="text-muted-foreground">
          Workforce, payroll, talent and everything in between.
        </p>
      </div>

      {denied && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <AlertCircle className="h-5 w-5" />
            You do not have access to workforce analytics. The sections below are still available
            to you.
          </CardContent>
        </Card>
      )}

      {/* Headline metrics */}
      {isPending && !overview && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {overview && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Headcount"
              color="indigo"
              value={overview.headcount}
              description={`${overview.hiresThisYear} hired · ${overview.exitsThisYear} exited this year`}
              icon={Users}
            />
            <StatCard
              title="Net Growth (YTD)"
              color={overview.netGrowth >= 0 ? 'emerald' : 'rose'}
              value={overview.netGrowth > 0 ? `+${overview.netGrowth}` : overview.netGrowth}
              description="Hires minus exits"
              icon={overview.netGrowth >= 0 ? UserPlus : UserMinus}
            />
            <StatCard
              title="Attrition Rate"
              color={overview.attritionRate > 15 ? 'amber' : 'violet'}
              value={`${overview.attritionRate}%`}
              description="Annualised, against average headcount"
              icon={TrendingDown}
            />
            <StatCard
              title="Present Today"
              color={overview.attendanceToday.attendanceRate < 80 ? 'amber' : 'teal'}
              value={`${overview.attendanceToday.present}`}
              secondaryValue={overview.headcount}
              description={`${overview.attendanceToday.late} late · ${overview.attendanceToday.onLeave} on leave`}
              icon={Clock}
              progress={overview.attendanceToday.attendanceRate}
            />
          </div>

          {/* Things needing attention */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Needs Attention</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: 'Leave requests pending', value: overview.actionItems.pendingLeaveRequests, href: '/hr/leave' },
                  { label: 'Probation ending in 30 days', value: overview.actionItems.probationEndingSoon, href: '/hr/staff' },
                  { label: 'Contracts expiring in 60 days', value: overview.actionItems.contractsExpiringSoon, href: '/hr/staff' },
                  { label: 'Onboarding in progress', value: overview.actionItems.pendingOnboarding, href: '/hr/onboarding' },
                  { label: 'Open job openings', value: overview.actionItems.openJobOpenings, href: '/hr/recruitment' },
                  { label: 'Active training programmes', value: overview.actionItems.activeTrainings, href: '/hr/training' },
                  { label: 'Assets on loan', value: overview.actionItems.assignedAssets, href: '/hr/assets' },
                  { label: 'Notices needing acknowledgement', value: overview.actionItems.noticesRequiringAck, href: '/hr/announcements' },
                ].map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-accent/50"
                  >
                    <span className="min-w-0 pr-2 text-sm">{item.label}</span>
                    <Badge variant={item.value > 0 ? 'warning' : 'secondary'}>{item.value}</Badge>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Hires & Exits — 12 Months</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: '1px solid hsl(var(--border))',
                          background: 'hsl(var(--background))',
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="hires" name="Hires" fill="#10b981" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="exits" name="Exits" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Headcount by Department</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={overview.departmentDistribution}
                        dataKey="count"
                        nameKey="department"
                        cx="50%"
                        cy="45%"
                        outerRadius={80}
                        innerRadius={45}
                        paddingAngle={2}
                      >
                        {overview.departmentDistribution.map((_: any, index: number) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: '1px solid hsl(var(--border))',
                          background: 'hsl(var(--background))',
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Composition + milestones */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Workforce Composition</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-medium">Employment Type</p>
                  <div className="space-y-2">
                    {overview.employmentTypeDistribution.map((item: any) => (
                      <div key={item.type} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="capitalize">
                            {item.type.replace('_', ' ').toLowerCase()}
                          </span>
                          <span className="tabular-nums text-muted-foreground">{item.count}</span>
                        </div>
                        <Progress
                          value={overview.headcount > 0 ? (item.count / overview.headcount) * 100 : 0}
                          className="h-1.5"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">Gender</p>
                  <div className="flex flex-wrap gap-2">
                    {overview.genderDistribution.map((item: any) => (
                      <Badge key={item.gender} variant="secondary">
                        {item.gender}: {item.count}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {milestones && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Cake className="h-5 w-5" />
                      Birthdays
                      <Badge variant="secondary">{milestones.birthdays.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {milestones.birthdays.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        None in the next 30 days
                      </p>
                    )}
                    {milestones.birthdays.slice(0, 6).map((person: any) => (
                      <div key={person.staffId} className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {initials(person.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{person.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {person.department}
                          </p>
                        </div>
                        <Badge variant={person.daysAway === 0 ? 'success' : 'outline'}>
                          {person.daysAway === 0 ? 'Today' : `${person.daysAway}d`}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <PartyPopper className="h-5 w-5" />
                      Work Anniversaries
                      <Badge variant="secondary">{milestones.anniversaries.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {milestones.anniversaries.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        None in the next 30 days
                      </p>
                    )}
                    {milestones.anniversaries.slice(0, 6).map((person: any) => (
                      <div key={person.staffId} className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {initials(person.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{person.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {person.years} year{person.years === 1 ? '' : 's'} · {person.department}
                          </p>
                        </div>
                        <Badge variant={person.daysAway === 0 ? 'success' : 'outline'}>
                          {person.daysAway === 0 ? 'Today' : `${person.daysAway}d`}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </>
      )}

      {/* Module navigation */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">HR Modules</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleSections.map((section) => {
            const Icon = section.icon;
            return (
              <Link key={section.href} href={section.href} className="group">
                <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
                  <CardContent className="flex h-full flex-col gap-3 pt-6">
                    <div className="flex items-start justify-between">
                      <span className="rounded-lg bg-primary/10 p-2 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{section.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
