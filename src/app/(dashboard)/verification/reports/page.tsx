'use client';

import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle,
  Clock,
  AlertTriangle,
  Users,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { getVerificationAnalytics } from '@/actions/verification.actions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalyticsData {
  summary: {
    totalTasks: number;
    completedCount: number;
    passRate: number;
    avgTurnaroundHours: number;
    overdueCount: number;
  };
  statusCounts: Record<string, number>;
  outcomeCounts: Record<string, number>;
  typeCounts: Record<string, number>;
  riskCounts: Record<string, number>;
  officerPerformance: Array<{
    officerId: string;
    name: string;
    employeeId: string;
    totalAssigned: number;
    totalCompleted: number;
    passRate: number;
  }>;
  completionTrend: Array<{ date: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Chart colors
// ---------------------------------------------------------------------------

const OUTCOME_COLORS: Record<string, string> = {
  VERIFIED: '#22c55e',
  FAILED: '#ef4444',
  INCONCLUSIVE: '#f59e0b',
};

const RISK_COLORS: Record<string, string> = {
  LOW: '#22c55e',
  MEDIUM: '#f59e0b',
  HIGH: '#f97316',
  VERY_HIGH: '#ef4444',
};

const STATUS_COLORS: Record<string, string> = {
  ASSIGNED: '#f59e0b',
  IN_PROGRESS: '#3b82f6',
  COMPLETED: '#22c55e',
  PENDING: '#9ca3af',
  FAILED: '#ef4444',
  CANCELLED: '#6b7280',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VerificationReportsPage() {
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    loadAnalytics();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAnalytics() {
    setLoading(true);
    try {
      const filters: Record<string, string> = {};
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;
      const result = await getVerificationAnalytics(
        Object.keys(filters).length > 0 ? filters : undefined
      );
      setData(result);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  function handleFilter() {
    loadAnalytics();
  }

  function exportPdf() {
    if (!data) return;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Verification Report', 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
    if (dateFrom || dateTo) {
      doc.text(`Period: ${dateFrom || 'Start'} to ${dateTo || 'Now'}`, 14, 34);
    }

    let y = dateFrom || dateTo ? 42 : 36;

    // Summary
    doc.setFontSize(12);
    doc.text('Summary', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value']],
      body: [
        ['Total Tasks', String(data.summary.totalTasks)],
        ['Completed', String(data.summary.completedCount)],
        ['Pass Rate', `${data.summary.passRate}%`],
        ['Avg Turnaround', `${data.summary.avgTurnaroundHours} hrs`],
        ['Overdue', String(data.summary.overdueCount)],
      ],
    });

    y = (doc as any).lastAutoTable.finalY + 10;

    // Officer performance
    if (data.officerPerformance.length > 0) {
      doc.setFontSize(12);
      doc.text('Officer Performance', 14, y);
      y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Officer', 'Employee ID', 'Assigned', 'Completed', 'Pass Rate']],
        body: data.officerPerformance.map((o) => [
          o.name,
          o.employeeId,
          String(o.totalAssigned),
          String(o.totalCompleted),
          `${o.passRate}%`,
        ]),
      });
    }

    doc.save('verification-report.pdf');
    toast.success('PDF exported');
  }

  // Prepare chart data
  const outcomeChartData = data
    ? Object.entries(data.outcomeCounts).map(([name, value]) => ({ name, value }))
    : [];

  const riskChartData = data
    ? Object.entries(data.riskCounts).map(([name, value]) => ({ name, value }))
    : [];

  const statusChartData = data
    ? Object.entries(data.statusCounts).map(([name, value]) => ({
        name: name.replace(/_/g, ' '),
        value,
        fill: STATUS_COLORS[name] || '#9ca3af',
      }))
    : [];

  const typeChartData = data
    ? Object.entries(data.typeCounts).map(([name, value]) => ({
        name: name.replace(/_/g, ' '),
        value,
      }))
    : [];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/verification">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Verification Reports</h1>
            <p className="text-sm text-muted-foreground">
              Analytics and performance metrics
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportPdf} disabled={!data || isPending}>
          <Download className="h-4 w-4 mr-1" />
          Export PDF
        </Button>
      </div>

      {/* Date Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div className="w-full sm:w-auto">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full sm:w-[160px]"
              />
            </div>
            <div className="w-full sm:w-auto">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full sm:w-[160px]"
              />
            </div>
            <Button onClick={handleFilter} disabled={loading} size="sm">
              Apply Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="font-medium">Loading analytics...</p>
        </div>
      ) : !data ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="font-medium">No data available</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                  <span className="text-xs text-muted-foreground">Total Tasks</span>
                </div>
                <p className="text-2xl font-bold mt-1">{data.summary.totalTasks}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-xs text-muted-foreground">Completed</span>
                </div>
                <p className="text-2xl font-bold mt-1">{data.summary.completedCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs text-muted-foreground">Pass Rate</span>
                </div>
                <p className="text-2xl font-bold mt-1">{data.summary.passRate}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span className="text-xs text-muted-foreground">Avg Turnaround</span>
                </div>
                <p className="text-2xl font-bold mt-1">{data.summary.avgTurnaroundHours}h</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-xs text-muted-foreground">Overdue</span>
                </div>
                <p className="text-2xl font-bold mt-1 text-red-600">{data.summary.overdueCount}</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Outcome Distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Verification Outcomes</CardTitle>
                <CardDescription>Distribution of completed verification results</CardDescription>
              </CardHeader>
              <CardContent>
                {outcomeChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={outcomeChartData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, value }) => `${name} (${value})`}
                      >
                        {outcomeChartData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={OUTCOME_COLORS[entry.name] || '#9ca3af'}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No outcome data</p>
                )}
              </CardContent>
            </Card>

            {/* Risk Level Distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Risk Level Distribution</CardTitle>
                <CardDescription>Risk assessments from verifications</CardDescription>
              </CardHeader>
              <CardContent>
                {riskChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={riskChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" name="Tasks">
                        {riskChartData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={RISK_COLORS[entry.name] || '#9ca3af'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No risk data</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Completion Trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">30-Day Completion Trend</CardTitle>
              <CardDescription>Verifications completed per day</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={data.completionTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(v) => `Date: ${v}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Completed"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Task Type + Status Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Task Type Distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Task Types</CardTitle>
              </CardHeader>
              <CardContent>
                {typeChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={typeChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" name="Tasks" fill="#6366f1" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No data</p>
                )}
              </CardContent>
            </Card>

            {/* Status Distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {statusChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={statusChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" name="Tasks">
                        {statusChartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No data</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Officer Performance Table */}
          {data.officerPerformance.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Officer Performance
                </CardTitle>
                <CardDescription>Verification task assignments and completion rates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Officer</TableHead>
                        <TableHead>Employee ID</TableHead>
                        <TableHead className="text-right">Assigned</TableHead>
                        <TableHead className="text-right">Completed</TableHead>
                        <TableHead className="text-right">Pass Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.officerPerformance.map((officer) => (
                        <TableRow key={officer.officerId}>
                          <TableCell className="font-medium">{officer.name}</TableCell>
                          <TableCell className="font-mono text-sm">{officer.employeeId}</TableCell>
                          <TableCell className="text-right">{officer.totalAssigned}</TableCell>
                          <TableCell className="text-right">{officer.totalCompleted}</TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant={
                                officer.passRate >= 80
                                  ? 'success'
                                  : officer.passRate >= 50
                                  ? 'warning'
                                  : 'destructive'
                              }
                            >
                              {officer.passRate}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
