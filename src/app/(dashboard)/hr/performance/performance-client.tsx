'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  ClipboardCheck,
  Plus,
  RefreshCw,
  Send,
  Star,
  AlertTriangle,
  CheckCircle,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/utils';
import {
  getPerformanceReviews,
  createPerformanceReview,
  submitReview,
  acknowledgeReview,
  getDisciplinaryActions,
  createDisciplinaryAction,
  respondToDisciplinaryAction,
  resolveDisciplinaryAction,
} from '@/actions/performance.actions';
import { getStaffList } from '@/actions/hr.actions';
import type { SessionUser } from '@/types';

const reviewStatusVariant: Record<string, 'success' | 'warning' | 'secondary' | 'default'> = {
  DRAFT: 'secondary',
  SUBMITTED: 'warning',
  ACKNOWLEDGED: 'success',
};

const disciplinaryStatusVariant: Record<string, 'success' | 'warning' | 'error' | 'secondary' | 'default'> = {
  OPEN: 'error',
  RESPONDED: 'warning',
  RESOLVED: 'success',
  ESCALATED: 'secondary',
};

interface PerformanceClientProps {
  user: SessionUser;
}

export function PerformanceClient({ user }: PerformanceClientProps) {
  const [isPending, startTransition] = useTransition();
  const [reviews, setReviews] = useState<any[]>([]);
  const [disciplinary, setDisciplinary] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);

  // Review form
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewStaffId, setReviewStaffId] = useState('');
  const [reviewPeriod, setReviewPeriod] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [metrics, setMetrics] = useState({ productivity: 3, quality: 3, attendance: 3, teamwork: 3, initiative: 3 });
  const [reviewStrengths, setReviewStrengths] = useState('');
  const [reviewImprovements, setReviewImprovements] = useState('');
  const [reviewGoals, setReviewGoals] = useState('');
  const [reviewComments, setReviewComments] = useState('');

  // Disciplinary form
  const [discOpen, setDiscOpen] = useState(false);
  const [discStaffId, setDiscStaffId] = useState('');
  const [discType, setDiscType] = useState('WARNING');
  const [discSeverity, setDiscSeverity] = useState('MINOR');
  const [discDescription, setDiscDescription] = useState('');
  const [discIncidentDate, setDiscIncidentDate] = useState('');

  // Detail dialogs
  const [reviewDetail, setReviewDetail] = useState<any>(null);
  const [discDetail, setDiscDetail] = useState<any>(null);
  const [responseText, setResponseText] = useState('');
  const [resolutionText, setResolutionText] = useState('');

  const isManager = user.permissions.includes('HR:PERFORMANCE_MANAGE');

  const fetchReviews = () => {
    startTransition(async () => {
      try {
        const result = await getPerformanceReviews({});
        setReviews(result.data);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load reviews');
      }
    });
  };

  const fetchDisciplinary = () => {
    startTransition(async () => {
      try {
        const result = await getDisciplinaryActions({});
        setDisciplinary(result.data);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load disciplinary actions');
      }
    });
  };

  const fetchStaff = () => {
    startTransition(async () => {
      try {
        const data = await getStaffList({});
        setStaffList(data);
      } catch { /* ignore */ }
    });
  };

  useEffect(() => {
    fetchReviews();
    fetchDisciplinary();
    fetchStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateReview = () => {
    if (!reviewStaffId || !reviewPeriod || !reviewDate) {
      toast.error('Staff, period, and date are required');
      return;
    }
    startTransition(async () => {
      const result = await createPerformanceReview({
        staffId: reviewStaffId,
        reviewPeriod: reviewPeriod,
        reviewDate: reviewDate,
        ...metrics,
        strengths: reviewStrengths || undefined,
        areasForImprovement: reviewImprovements || undefined,
        goals: reviewGoals || undefined,
        comments: reviewComments || undefined,
      });
      if (result.success) {
        toast.success(result.message);
        setReviewOpen(false);
        fetchReviews();
      } else {
        toast.error(result.error || 'Failed to create review');
      }
    });
  };

  const handleSubmitReview = (id: string) => {
    startTransition(async () => {
      const result = await submitReview(id);
      if (result.success) {
        toast.success(result.message);
        fetchReviews();
        setReviewDetail(null);
      } else {
        toast.error(result.error || 'Failed');
      }
    });
  };

  const handleAcknowledgeReview = (id: string) => {
    startTransition(async () => {
      const result = await acknowledgeReview(id);
      if (result.success) {
        toast.success(result.message);
        fetchReviews();
        setReviewDetail(null);
      } else {
        toast.error(result.error || 'Failed');
      }
    });
  };

  const handleCreateDisciplinary = () => {
    if (!discStaffId || !discDescription || !discIncidentDate) {
      toast.error('Staff, description, and incident date are required');
      return;
    }
    startTransition(async () => {
      const result = await createDisciplinaryAction({
        staffId: discStaffId,
        type: discType,
        severity: discSeverity,
        description: discDescription,
        incidentDate: discIncidentDate,
      });
      if (result.success) {
        toast.success(result.message);
        setDiscOpen(false);
        fetchDisciplinary();
      } else {
        toast.error(result.error || 'Failed');
      }
    });
  };

  const handleRespond = (id: string) => {
    if (!responseText.trim()) { toast.error('Response is required'); return; }
    startTransition(async () => {
      const result = await respondToDisciplinaryAction(id, responseText.trim());
      if (result.success) {
        toast.success(result.message);
        setDiscDetail(null);
        setResponseText('');
        fetchDisciplinary();
      } else {
        toast.error(result.error || 'Failed');
      }
    });
  };

  const handleResolve = (id: string) => {
    if (!resolutionText.trim()) { toast.error('Resolution is required'); return; }
    startTransition(async () => {
      const result = await resolveDisciplinaryAction(id, resolutionText.trim());
      if (result.success) {
        toast.success(result.message);
        setDiscDetail(null);
        setResolutionText('');
        fetchDisciplinary();
      } else {
        toast.error(result.error || 'Failed');
      }
    });
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star key={i} className={`h-4 w-4 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
    ));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6" />
          Performance & Discipline
        </h1>
        <p className="text-muted-foreground">Manage reviews, KPIs, and disciplinary actions</p>
      </div>

      <Tabs defaultValue="reviews">
        <TabsList>
          <TabsTrigger value="reviews">Performance Reviews</TabsTrigger>
          <TabsTrigger value="discipline">Disciplinary Records</TabsTrigger>
        </TabsList>

        {/* REVIEWS TAB */}
        <TabsContent value="reviews">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Reviews</CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={fetchReviews} disabled={isPending}>
                  <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
                </Button>
                {isManager && (
                  <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm"><Plus className="mr-2 h-4 w-4" />New Review</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Create Performance Review</DialogTitle>
                        <DialogDescription>Rate staff performance across key metrics (1-5).</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Staff Member</Label>
                          <Select value={reviewStaffId} onValueChange={setReviewStaffId}>
                            <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                            <SelectContent>
                              {staffList.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.employeeId})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Review Period</Label>
                            <Input placeholder="e.g., Q1 2026" value={reviewPeriod} onChange={(e) => setReviewPeriod(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Review Date</Label>
                            <Input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
                          </div>
                        </div>
                        {(['productivity', 'quality', 'attendance', 'teamwork', 'initiative'] as const).map((m) => (
                          <div key={m} className="flex items-center justify-between">
                            <Label className="capitalize">{m}</Label>
                            <Select value={String(metrics[m])} onValueChange={(v) => setMetrics((p) => ({ ...p, [m]: parseInt(v) }))}>
                              <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {[1, 2, 3, 4, 5].map((n) => (<SelectItem key={n} value={String(n)}>{n}</SelectItem>))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                        <div className="space-y-2">
                          <Label>Strengths</Label>
                          <Textarea value={reviewStrengths} onChange={(e) => setReviewStrengths(e.target.value)} placeholder="Key strengths..." />
                        </div>
                        <div className="space-y-2">
                          <Label>Areas for Improvement</Label>
                          <Textarea value={reviewImprovements} onChange={(e) => setReviewImprovements(e.target.value)} placeholder="Areas to improve..." />
                        </div>
                        <div className="space-y-2">
                          <Label>Goals</Label>
                          <Textarea value={reviewGoals} onChange={(e) => setReviewGoals(e.target.value)} placeholder="Goals for next period..." />
                        </div>
                        <div className="space-y-2">
                          <Label>Comments</Label>
                          <Textarea value={reviewComments} onChange={(e) => setReviewComments(e.target.value)} placeholder="Additional comments..." />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleCreateReview} disabled={isPending}>
                          {isPending ? 'Creating...' : 'Create Review'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Reviewer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviews.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {isPending ? 'Loading...' : 'No performance reviews found'}
                      </TableCell>
                    </TableRow>
                  )}
                  {reviews.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.staff.firstName} {r.staff.lastName}</div>
                        <div className="text-xs text-muted-foreground">{r.staff.employeeId}</div>
                      </TableCell>
                      <TableCell>{r.staff.department?.name}</TableCell>
                      <TableCell>{r.reviewPeriod}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {renderStars(Math.round(r.overallRating))}
                          <span className="ml-1 text-sm font-medium">{r.overallRating.toFixed(1)}</span>
                        </div>
                      </TableCell>
                      <TableCell>{r.reviewer.firstName} {r.reviewer.lastName}</TableCell>
                      <TableCell>
                        <Badge variant={reviewStatusVariant[r.status] || 'default'}>{r.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setReviewDetail(r)}>
                          <Eye className="mr-1 h-4 w-4" />View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DISCIPLINE TAB */}
        <TabsContent value="discipline">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Disciplinary Records
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={fetchDisciplinary} disabled={isPending}>
                  <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
                </Button>
                {isManager && (
                  <Dialog open={discOpen} onOpenChange={setDiscOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="destructive"><Plus className="mr-2 h-4 w-4" />New Action</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Issue Disciplinary Action</DialogTitle>
                        <DialogDescription>Record a formal disciplinary action against a staff member.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Staff Member</Label>
                          <Select value={discStaffId} onValueChange={setDiscStaffId}>
                            <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                            <SelectContent>
                              {staffList.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.employeeId})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Type</Label>
                            <Select value={discType} onValueChange={setDiscType}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="WARNING">Warning</SelectItem>
                                <SelectItem value="QUERY">Query</SelectItem>
                                <SelectItem value="SUSPENSION">Suspension</SelectItem>
                                <SelectItem value="TERMINATION">Termination</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Severity</Label>
                            <Select value={discSeverity} onValueChange={setDiscSeverity}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="MINOR">Minor</SelectItem>
                                <SelectItem value="MAJOR">Major</SelectItem>
                                <SelectItem value="CRITICAL">Critical</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Incident Date</Label>
                          <Input type="date" value={discIncidentDate} onChange={(e) => setDiscIncidentDate(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Textarea value={discDescription} onChange={(e) => setDiscDescription(e.target.value)} placeholder="Describe the incident and action taken..." />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="destructive" onClick={handleCreateDisciplinary} disabled={isPending}>
                          {isPending ? 'Creating...' : 'Issue Action'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Incident Date</TableHead>
                    <TableHead>Issued By</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {disciplinary.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {isPending ? 'Loading...' : 'No disciplinary records found'}
                      </TableCell>
                    </TableRow>
                  )}
                  {disciplinary.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="font-medium">{d.staff.firstName} {d.staff.lastName}</div>
                        <div className="text-xs text-muted-foreground">{d.staff.employeeId}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{d.type}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={d.severity === 'CRITICAL' ? 'destructive' : d.severity === 'MAJOR' ? 'warning' : 'secondary'}>
                          {d.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(d.incidentDate)}</TableCell>
                      <TableCell>{d.issuedBy.firstName} {d.issuedBy.lastName}</TableCell>
                      <TableCell>
                        <Badge variant={disciplinaryStatusVariant[d.status] || 'default'}>{d.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setDiscDetail(d)}>
                          <Eye className="mr-1 h-4 w-4" />View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Detail Dialog */}
      <Dialog open={!!reviewDetail} onOpenChange={(o) => { if (!o) setReviewDetail(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Performance Review Details</DialogTitle>
          </DialogHeader>
          {reviewDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Staff:</span> <span className="font-medium">{reviewDetail.staff.firstName} {reviewDetail.staff.lastName}</span></div>
                <div><span className="text-muted-foreground">Period:</span> <span className="font-medium">{reviewDetail.reviewPeriod}</span></div>
                <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{formatDate(reviewDetail.reviewDate)}</span></div>
                <div><span className="text-muted-foreground">Rating:</span> <span className="font-medium">{reviewDetail.overallRating.toFixed(1)} / 5.0</span></div>
              </div>
              <div className="space-y-2">
                {(['productivity', 'quality', 'attendance', 'teamwork', 'initiative'] as const).map((m) => (
                  <div key={m} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{m}</span>
                    <div className="flex">{renderStars(reviewDetail[m])}</div>
                  </div>
                ))}
              </div>
              {reviewDetail.strengths && <div><p className="text-sm text-muted-foreground">Strengths</p><p className="text-sm">{reviewDetail.strengths}</p></div>}
              {reviewDetail.areasForImprovement && <div><p className="text-sm text-muted-foreground">Areas for Improvement</p><p className="text-sm">{reviewDetail.areasForImprovement}</p></div>}
              {reviewDetail.goals && <div><p className="text-sm text-muted-foreground">Goals</p><p className="text-sm">{reviewDetail.goals}</p></div>}
              <Badge variant={reviewStatusVariant[reviewDetail.status] || 'default'}>{reviewDetail.status}</Badge>
            </div>
          )}
          <DialogFooter>
            {reviewDetail?.status === 'DRAFT' && isManager && (
              <Button onClick={() => handleSubmitReview(reviewDetail.id)} disabled={isPending}>
                <Send className="mr-2 h-4 w-4" />{isPending ? 'Submitting...' : 'Submit Review'}
              </Button>
            )}
            {reviewDetail?.status === 'SUBMITTED' && reviewDetail?.staffId === user.id && (
              <Button onClick={() => handleAcknowledgeReview(reviewDetail.id)} disabled={isPending}>
                <CheckCircle className="mr-2 h-4 w-4" />{isPending ? 'Acknowledging...' : 'Acknowledge'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disciplinary Detail Dialog */}
      <Dialog open={!!discDetail} onOpenChange={(o) => { if (!o) { setDiscDetail(null); setResponseText(''); setResolutionText(''); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Disciplinary Action Details</DialogTitle>
          </DialogHeader>
          {discDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Staff:</span> <span className="font-medium">{discDetail.staff.firstName} {discDetail.staff.lastName}</span></div>
                <div><span className="text-muted-foreground">Type:</span> <Badge variant="outline">{discDetail.type}</Badge></div>
                <div><span className="text-muted-foreground">Severity:</span> <Badge variant={discDetail.severity === 'CRITICAL' ? 'destructive' : 'secondary'}>{discDetail.severity}</Badge></div>
                <div><span className="text-muted-foreground">Incident:</span> <span className="font-medium">{formatDate(discDetail.incidentDate)}</span></div>
              </div>
              <div><p className="text-sm text-muted-foreground">Description</p><p className="text-sm">{discDetail.description}</p></div>
              {discDetail.response && <div><p className="text-sm text-muted-foreground">Staff Response</p><p className="text-sm">{discDetail.response}</p></div>}
              {discDetail.resolution && <div><p className="text-sm text-muted-foreground">Resolution</p><p className="text-sm">{discDetail.resolution}</p></div>}
              <Badge variant={disciplinaryStatusVariant[discDetail.status] || 'default'}>{discDetail.status}</Badge>

              {discDetail.status === 'OPEN' && discDetail.staffId === user.id && (
                <div className="space-y-2 border-t pt-4">
                  <Label>Your Response</Label>
                  <Textarea value={responseText} onChange={(e) => setResponseText(e.target.value)} placeholder="Provide your response..." />
                  <Button onClick={() => handleRespond(discDetail.id)} disabled={isPending}>
                    {isPending ? 'Submitting...' : 'Submit Response'}
                  </Button>
                </div>
              )}

              {(discDetail.status === 'OPEN' || discDetail.status === 'RESPONDED') && isManager && (
                <div className="space-y-2 border-t pt-4">
                  <Label>Resolution</Label>
                  <Textarea value={resolutionText} onChange={(e) => setResolutionText(e.target.value)} placeholder="Enter resolution..." />
                  <Button variant="default" onClick={() => handleResolve(discDetail.id)} disabled={isPending}>
                    <CheckCircle className="mr-2 h-4 w-4" />{isPending ? 'Resolving...' : 'Resolve'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
