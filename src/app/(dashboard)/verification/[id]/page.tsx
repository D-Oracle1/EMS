'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Camera,
  ClipboardCheck,
  CheckCircle,
  Crosshair,
  Download,
  ImageIcon,
  Loader2,
  Lock,
  ShieldAlert,
  XCircle,
  MapPin,
  User,
  Briefcase,
  Phone,
  Mail,
  Home,
  HandCoins,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  getVerificationTask,
  submitVerificationResult,
  startVerificationTask,
} from '@/actions/verification.actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VerificationTaskDetail {
  id: string;
  status: string;
  priority: string;
  taskType: string;
  verificationType: string;
  result: string | null;
  recommendation: string | null;
  addressVerified: boolean | null;
  employmentVerified: boolean | null;
  incomeVerified: boolean | null;
  collateralVerified: boolean | null;
  remarks: string | null;
  findings: string | null;
  verifiedAddress: string | null;
  gpsCoordinates: string | null;
  photos: string[];
  assignedToId: string | null;
  address: string | null;
  city: string | null;
  instructions: string | null;
  createdAt: Date | string;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  customer: {
    firstName: string;
    lastName: string;
    customerNumber: string;
    monthlyIncome: number;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    employer?: string;
    occupation?: string;
    [key: string]: unknown;
  } | null;
  loan: {
    loanNumber: string;
    principalAmount: number;
    status: string;
  } | null;
  assignedTo: {
    firstName: string;
    lastName: string;
    employeeId: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Priority / status helpers
// ---------------------------------------------------------------------------

const PRIORITY_VARIANT: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-800 border-red-200',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  LOW: 'bg-green-100 text-green-800 border-green-200',
};

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
> = {
  ASSIGNED: 'warning',
  PENDING: 'warning',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VerificationTaskDetailPage() {
  const router = useRouter();
  const params = useParams();
  const taskId = params.id as string;

  const [isPending, startTransition] = useTransition();
  const [task, setTask] = useState<VerificationTaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [addressVerified, setAddressVerified] = useState(false);
  const [employmentVerified, setEmploymentVerified] = useState(false);
  const [incomeVerified, setIncomeVerified] = useState(false);
  const [collateralVerified, setCollateralVerified] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [findings, setFindings] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [nearestLandmark, setNearestLandmark] = useState('');
  const [area, setArea] = useState('');
  const [lga, setLga] = useState('');
  const [state, setState] = useState('');
  const [result, setResult] = useState('VERIFIED');

  // GPS state
  const [gpsCoordinates, setGpsCoordinates] = useState('');
  const [capturingGps, setCapturingGps] = useState(false);
  const [gpsTimestamp, setGpsTimestamp] = useState<string | null>(null);

  // Property valuation state
  const [estimatedValue, setEstimatedValue] = useState('');
  const [propertyCondition, setPropertyCondition] = useState('');
  const [propertyComments, setPropertyComments] = useState('');

  // Risk scoring
  const [riskLevel, setRiskLevel] = useState('MEDIUM');

  // Photo upload state
  const [photos, setPhotos] = useState<Array<{ name: string; dataUrl: string }>>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    loadTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function loadTask() {
    setLoading(true);
    setError(null);
    try {
      const data = await getVerificationTask(taskId);
      setTask(data as unknown as VerificationTaskDetail);
    } catch (err: any) {
      setError(err.message || 'Failed to load verification task');
    } finally {
      setLoading(false);
    }
  }

  function captureGps() {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }
    setCapturingGps(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
        setGpsCoordinates(coords);
        setGpsTimestamp(new Date().toISOString());
        setCapturingGps(false);
        toast.success(`GPS captured: ${coords}`);
      },
      (error) => {
        setCapturingGps(false);
        toast.error(`GPS error: ${error.message}`);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function exportTaskPdf() {
    if (!task) return;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Verification Report', 14, 20);
    doc.setFontSize(10);
    doc.text(`Task ID: ${task.id}`, 14, 28);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 34);

    let y = 42;

    // Task details
    doc.setFontSize(12);
    doc.text('Task Details', 14, y);
    y += 6;
    const taskDetails: string[][] = [
      ['Task Type', (task.taskType || '').replace(/_/g, ' ')],
      ['Status', task.status],
      ['Priority', task.priority],
      ['Result', task.result || 'N/A'],
      ['Recommendation', task.recommendation?.replace(/_/g, ' ') || 'N/A'],
    ];
    if (task.assignedTo) {
      taskDetails.push(['Verified By', `${task.assignedTo.firstName} ${task.assignedTo.lastName} (${task.assignedTo.employeeId})`]);
    }
    if (task.createdAt) taskDetails.push(['Created', new Date(task.createdAt).toLocaleString()]);
    if (task.startedAt) taskDetails.push(['Started', new Date(task.startedAt).toLocaleString()]);
    if (task.completedAt) taskDetails.push(['Completed', new Date(task.completedAt).toLocaleString()]);
    if (task.gpsCoordinates) taskDetails.push(['GPS Coordinates', task.gpsCoordinates]);

    autoTable(doc, { startY: y, head: [['Field', 'Value']], body: taskDetails });
    y = (doc as any).lastAutoTable.finalY + 10;

    // Customer info
    if (task.customer) {
      doc.setFontSize(12);
      doc.text('Customer Information', 14, y);
      y += 6;
      const custDetails: string[][] = [
        ['Name', `${task.customer.firstName} ${task.customer.lastName}`],
        ['Customer #', task.customer.customerNumber],
      ];
      if (task.customer.phone) custDetails.push(['Phone', task.customer.phone]);
      if (task.customer.email) custDetails.push(['Email', task.customer.email]);
      if (task.customer.address) custDetails.push(['Address', task.customer.address]);
      if (task.customer.employer) custDetails.push(['Employer', task.customer.employer as string]);
      if (task.customer.monthlyIncome) custDetails.push(['Monthly Income', `${task.customer.monthlyIncome}`]);

      autoTable(doc, { startY: y, head: [['Field', 'Value']], body: custDetails });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    // Loan info
    if (task.loan) {
      doc.setFontSize(12);
      doc.text('Loan Information', 14, y);
      y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Field', 'Value']],
        body: [
          ['Loan Number', task.loan.loanNumber],
          ['Principal', `${task.loan.principalAmount}`],
          ['Status', task.loan.status],
        ],
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    // Verification checks
    doc.setFontSize(12);
    doc.text('Verification Checks', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Check', 'Result']],
      body: [
        ['Address Verified', task.addressVerified ? 'YES' : 'NO'],
        ['Employment Verified', task.employmentVerified ? 'YES' : 'NO'],
        ['Income Verified', task.incomeVerified ? 'YES' : 'NO'],
        ['Collateral Verified', task.collateralVerified ? 'YES' : 'NO'],
      ],
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    // Remarks and findings
    if (task.remarks) {
      doc.setFontSize(12);
      doc.text('Remarks', 14, y);
      y += 6;
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(task.remarks, 180);
      doc.text(lines, 14, y);
      y += lines.length * 5 + 6;
    }

    if (task.findings) {
      doc.setFontSize(12);
      doc.text('Findings', 14, y);
      y += 6;
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(task.findings, 180);
      doc.text(lines, 14, y);
      y += lines.length * 5 + 6;
    }

    if (task.verifiedAddress) {
      doc.setFontSize(12);
      doc.text('Verified Address', 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(task.verifiedAddress, 14, y);
      y += 10;
    }

    // Signature block
    if (y > 250) { doc.addPage(); y = 20; }
    y += 10;
    doc.setFontSize(10);
    doc.text('____________________________', 14, y);
    y += 6;
    doc.text('Verification Officer Signature', 14, y);
    y += 12;
    doc.text('____________________________', 14, y);
    y += 6;
    doc.text('Date', 14, y);

    doc.save(`verification-${task.id.slice(0, 8)}.pdf`);
    toast.success('Verification report exported');
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhoto(true);
    const newPhotos: Array<{ name: string; dataUrl: string }> = [];

    let processed = 0;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image`);
        processed++;
        if (processed === files.length) setUploadingPhoto(false);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 5MB limit`);
        processed++;
        if (processed === files.length) setUploadingPhoto(false);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        newPhotos.push({ name: file.name, dataUrl: reader.result as string });
        processed++;
        if (processed === files.length) {
          setPhotos((prev) => [...prev, ...newPhotos]);
          setUploadingPhoto(false);
        }
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    e.target.value = '';
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!remarks.trim()) {
      toast.error('Remarks are required');
      return;
    }

    startTransition(async () => {
      const submitData: {
        result: 'VERIFIED' | 'FAILED' | 'INCONCLUSIVE';
        addressVerified: boolean;
        employmentVerified: boolean;
        incomeVerified: boolean;
        collateralVerified: boolean;
        remarks: string;
        findings?: string;
        verifiedAddress?: string;
        gpsCoordinates?: string;
        riskLevel?: string;
        estimatedValue?: number;
        propertyCondition?: string;
        propertyComments?: string;
        photos?: string[];
      } = {
        result: result as 'VERIFIED' | 'FAILED' | 'INCONCLUSIVE',
        addressVerified,
        employmentVerified,
        incomeVerified,
        collateralVerified,
        remarks: remarks.trim(),
        riskLevel,
      };

      if (findings.trim()) submitData.findings = findings.trim();
      if (gpsCoordinates.trim()) submitData.gpsCoordinates = gpsCoordinates.trim() + (gpsTimestamp ? ` [${gpsTimestamp}]` : '');
      if (estimatedValue) submitData.estimatedValue = parseFloat(estimatedValue);
      if (propertyCondition.trim()) submitData.propertyCondition = propertyCondition.trim();
      if (propertyComments.trim()) submitData.propertyComments = propertyComments.trim();
      if (photos.length > 0) submitData.photos = photos.map((p) => p.dataUrl);

      // Combine structured address fields
      const addressParts = [streetAddress, nearestLandmark, area, lga, state].map(s => s.trim()).filter(Boolean);
      if (addressParts.length > 0) submitData.verifiedAddress = addressParts.join(', ');

      const res = await submitVerificationResult(taskId, submitData);

      if (res.success) {
        toast.success(res.message || 'Verification submitted successfully');
        router.push('/verification');
      } else {
        toast.error(res.error || 'Failed to submit verification');
      }
    });
  }

  async function handleStartTask() {
    startTransition(async () => {
      const res = await startVerificationTask(taskId);
      if (res.success) {
        toast.success(res.message || 'Verification started');
        loadTask();
      } else {
        toast.error(res.error || 'Failed to start verification');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderInfoRow(label: string, value: React.ReactNode) {
    return (
      <div className="flex justify-between py-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium text-right">{value}</span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Loading / Error states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-6">
        <Link href="/verification">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Verification Tasks
          </Button>
        </Link>
        <div className="text-center py-12 text-muted-foreground">
          <p className="font-medium">Loading task...</p>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="space-y-6">
        <Link href="/verification">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Verification Tasks
          </Button>
        </Link>
        <div className="text-center py-12 text-muted-foreground">
          <p className="font-medium text-red-600">{error || 'Task not found'}</p>
        </div>
      </div>
    );
  }

  const isInProgress = task.status === 'IN_PROGRESS';
  const isCompleted = task.status === 'COMPLETED';

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link href="/verification">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Verification Tasks
        </Button>
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-6 w-6 text-indigo-600" />
            <h1 className="text-2xl font-bold tracking-tight">Verification Task</h1>
            <Badge variant={STATUS_VARIANT[task.status] || 'secondary'}>
              {task.status.replace(/_/g, ' ')}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {task.customer
              ? `${task.customer.firstName} ${task.customer.lastName}`
              : 'No customer'}
            {task.loan ? ` -- Loan ${task.loan.loanNumber}` : ''}
          </p>
        </div>
        {task.status === 'ASSIGNED' && (
          <Button onClick={handleStartTask} disabled={isPending} size="lg">
            <ClipboardCheck className="h-4 w-4 mr-2" />
            {isPending ? 'Starting...' : 'Start Verification'}
          </Button>
        )}
      </div>

      {/* Task Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Task Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0 divide-y">
          {renderInfoRow(
            'Customer',
            task.customer
              ? `${task.customer.firstName} ${task.customer.lastName} (${task.customer.customerNumber})`
              : '-'
          )}
          {renderInfoRow('Loan Number', task.loan?.loanNumber || '-')}
          {renderInfoRow(
            'Priority',
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                PRIORITY_VARIANT[task.priority] || 'bg-gray-100 text-gray-800'
              }`}
            >
              {task.priority}
            </span>
          )}
          {renderInfoRow(
            'Status',
            <Badge variant={STATUS_VARIANT[task.status] || 'secondary'}>
              {task.status.replace(/_/g, ' ')}
            </Badge>
          )}
          {renderInfoRow(
            'Assigned To',
            task.assignedTo
              ? `${task.assignedTo.firstName} ${task.assignedTo.lastName} (${task.assignedTo.employeeId})`
              : 'Unassigned'
          )}
          {renderInfoRow(
            'Verification Type',
            (task.verificationType || '').replace(/_/g, ' ')
          )}
        </CardContent>
      </Card>

      {/* Customer Details */}
      {task.customer && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-blue-600" />
              Customer Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 divide-y sm:divide-y-0">
              {renderInfoRow('Name', `${task.customer.firstName} ${task.customer.lastName}`)}
              {renderInfoRow('Customer No.', task.customer.customerNumber)}
              {task.customer.phone && renderInfoRow('Phone', (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {task.customer.phone}
                </span>
              ))}
              {task.customer.email && renderInfoRow('Email', (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {task.customer.email}
                </span>
              ))}
              {task.customer.address && renderInfoRow('Address', (
                <span className="flex items-center gap-1">
                  <Home className="h-3 w-3" /> {task.customer.address}{task.customer.city ? `, ${task.customer.city}` : ''}{task.customer.state ? `, ${task.customer.state}` : ''}
                </span>
              ))}
              {task.customer.employer && renderInfoRow('Employer', (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3 w-3" /> {task.customer.employer}
                </span>
              ))}
              {task.customer.occupation && renderInfoRow('Occupation', task.customer.occupation)}
              {task.customer.monthlyIncome > 0 && renderInfoRow('Monthly Income', (
                <span className="flex items-center gap-1">
                  <HandCoins className="h-3 w-3" />
                  {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(task.customer.monthlyIncome)}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loan Details */}
      {task.loan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Loan Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 divide-y">
            {renderInfoRow('Loan Number', task.loan.loanNumber)}
            {renderInfoRow('Principal Amount', new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(task.loan.principalAmount))}
            {renderInfoRow('Loan Status', (
              <Badge variant="outline">{task.loan.status.replace(/_/g, ' ')}</Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      {task.instructions && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <ClipboardCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-900 mb-1">Verification Instructions</p>
                <p className="text-sm text-blue-800">{task.instructions}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Immutability Banner */}
      {isCompleted && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-slate-600 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-slate-800">Verification Locked</p>
              <p className="text-slate-600">
                This verification has been submitted and is now immutable. No further edits can be made.
                {task.completedAt && <> Completed: {new Date(task.completedAt).toLocaleString()}</>}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={exportTaskPdf} className="shrink-0">
            <Download className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Export PDF</span>
          </Button>
        </div>
      )}

      {/* --------------------------------------------------------------- */}
      {/* Verification Form (if IN_PROGRESS)                              */}
      {/* --------------------------------------------------------------- */}
      {isInProgress && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Submit Verification Result</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Checkboxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={addressVerified}
                    onChange={(e) => setAddressVerified(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <div>
                    <p className="text-sm font-medium">Address Verified</p>
                    <p className="text-xs text-muted-foreground">
                      Customer address has been verified
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={employmentVerified}
                    onChange={(e) => setEmploymentVerified(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <div>
                    <p className="text-sm font-medium">Employment Verified</p>
                    <p className="text-xs text-muted-foreground">
                      Employment details confirmed
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={incomeVerified}
                    onChange={(e) => setIncomeVerified(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <div>
                    <p className="text-sm font-medium">Income Verified</p>
                    <p className="text-xs text-muted-foreground">
                      Income documentation verified
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={collateralVerified}
                    onChange={(e) => setCollateralVerified(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <div>
                    <p className="text-sm font-medium">Collateral Verified</p>
                    <p className="text-xs text-muted-foreground">
                      Collateral has been inspected
                    </p>
                  </div>
                </label>
              </div>

              <Separator />

              {/* Remarks (required) */}
              <div className="space-y-2">
                <Label>
                  Remarks <span className="text-red-500">*</span>
                </Label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  required
                  rows={3}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="Enter your verification remarks..."
                />
              </div>

              {/* Findings */}
              <div className="space-y-2">
                <Label>Findings</Label>
                <textarea
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                  rows={3}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="Describe your findings (optional)..."
                />
              </div>

              {/* GPS Auto-Capture */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 font-medium">
                  <Crosshair className="h-4 w-4" />
                  GPS Location
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={gpsCoordinates}
                    onChange={(e) => setGpsCoordinates(e.target.value)}
                    placeholder="Latitude, Longitude (e.g., 6.5244, 3.3792)"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={captureGps}
                    disabled={capturingGps}
                  >
                    {capturingGps ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Crosshair className="h-4 w-4 mr-1" />
                    )}
                    {capturingGps ? 'Capturing...' : 'Auto-Capture'}
                  </Button>
                </div>
                {gpsTimestamp && (
                  <p className="text-xs text-muted-foreground">
                    Captured at: {new Date(gpsTimestamp).toLocaleString()}
                  </p>
                )}
              </div>

              <Separator />

              {/* Risk Scoring */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 font-medium">
                  <ShieldAlert className="h-4 w-4" />
                  Risk Assessment <span className="text-red-500">*</span>
                </Label>
                <Select value={riskLevel} onValueChange={setRiskLevel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select risk level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low Risk</SelectItem>
                    <SelectItem value="MEDIUM">Medium Risk</SelectItem>
                    <SelectItem value="HIGH">High Risk</SelectItem>
                    <SelectItem value="VERY_HIGH">Very High Risk</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Property/Collateral Valuation */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2 font-medium">
                  <Home className="h-4 w-4" />
                  Property / Collateral Assessment
                </Label>
                <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Estimated Value</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={estimatedValue}
                        onChange={(e) => setEstimatedValue(e.target.value)}
                        placeholder="e.g. 5000000"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Property Condition</Label>
                      <Select value={propertyCondition} onValueChange={setPropertyCondition}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select condition" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EXCELLENT">Excellent</SelectItem>
                          <SelectItem value="GOOD">Good</SelectItem>
                          <SelectItem value="FAIR">Fair</SelectItem>
                          <SelectItem value="POOR">Poor</SelectItem>
                          <SelectItem value="DILAPIDATED">Dilapidated</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Property Comments</Label>
                    <textarea
                      value={propertyComments}
                      onChange={(e) => setPropertyComments(e.target.value)}
                      rows={2}
                      className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      placeholder="Describe property type, location, ownership status..."
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Photo Upload */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2 font-medium">
                  <Camera className="h-4 w-4" />
                  Verification Photos
                </Label>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 px-4 py-2 rounded-md border border-input bg-background hover:bg-accent cursor-pointer transition-colors">
                      <ImageIcon className="h-4 w-4" />
                      <span className="text-sm">
                        {uploadingPhoto ? 'Uploading...' : 'Add Photos'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePhotoUpload}
                        className="hidden"
                        disabled={uploadingPhoto}
                      />
                    </label>
                    <span className="text-xs text-muted-foreground">
                      Max 5MB per photo. JPG, PNG supported.
                    </span>
                  </div>
                  {photos.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {photos.map((photo, idx) => (
                        <div key={idx} className="relative group rounded-lg border overflow-hidden">
                          <img
                            src={photo.dataUrl}
                            alt={photo.name}
                            className="w-full h-32 object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                              type="button"
                              onClick={() => removePhoto(idx)}
                              className="text-white bg-red-600 rounded-full p-1 hover:bg-red-700"
                            >
                              <XCircle className="h-5 w-5" />
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground p-1 truncate">{photo.name}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Verified Address */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2 font-medium">
                  <MapPin className="h-4 w-4" />
                  Verified Address
                </Label>
                <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Street / House No.</Label>
                    <Input
                      value={streetAddress}
                      onChange={(e) => setStreetAddress(e.target.value)}
                      placeholder="e.g. No. 5, Balogun Street"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Nearest Landmark</Label>
                    <Input
                      value={nearestLandmark}
                      onChange={(e) => setNearestLandmark(e.target.value)}
                      placeholder="e.g. Opposite GTBank, beside Shoprite"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Area / Town</Label>
                      <Input
                        value={area}
                        onChange={(e) => setArea(e.target.value)}
                        placeholder="e.g. Ikoyi"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">LGA</Label>
                      <Input
                        value={lga}
                        onChange={(e) => setLga(e.target.value)}
                        placeholder="e.g. Eti-Osa"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">State</Label>
                      <Input
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder="e.g. Lagos"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Result */}
              <div className="space-y-2">
                <Label>
                  Verification Result <span className="text-red-500">*</span>
                </Label>
                <Select value={result} onValueChange={setResult}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select result" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VERIFIED">Verified</SelectItem>
                    <SelectItem value="FAILED">Failed</SelectItem>
                    <SelectItem value="INCONCLUSIVE">Inconclusive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-3">
                <Link href="/verification">
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Submitting...' : 'Submit Verification'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* --------------------------------------------------------------- */}
      {/* Read-only Results (if COMPLETED)                                */}
      {/* --------------------------------------------------------------- */}
      {isCompleted && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Verification Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Result + Recommendation + Risk badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Result:</span>
              <Badge
                variant={
                  task.result === 'VERIFIED'
                    ? 'success'
                    : task.result === 'FAILED'
                    ? 'destructive'
                    : 'warning'
                }
              >
                {task.result || '-'}
              </Badge>
              {task.recommendation && (
                <>
                  <span className="text-sm text-muted-foreground">|</span>
                  <span className="text-sm text-muted-foreground">Recommendation:</span>
                  <Badge
                    variant={
                      task.recommendation === 'APPROVE'
                        ? 'success'
                        : task.recommendation === 'DECLINE'
                        ? 'destructive'
                        : 'warning'
                    }
                  >
                    {task.recommendation.replace(/_/g, ' ')}
                  </Badge>
                </>
              )}
            </div>

            {/* Verification checks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                {task.addressVerified ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className="text-sm">
                  Address {task.addressVerified ? 'Verified' : 'Not Verified'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {task.employmentVerified ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className="text-sm">
                  Employment {task.employmentVerified ? 'Verified' : 'Not Verified'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {task.incomeVerified ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className="text-sm">
                  Income {task.incomeVerified ? 'Verified' : 'Not Verified'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {task.collateralVerified ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className="text-sm">
                  Collateral {task.collateralVerified ? 'Verified' : 'Not Verified'}
                </span>
              </div>
            </div>

            <Separator />

            {/* Remarks & Findings */}
            {task.remarks && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Remarks</p>
                <p className="text-sm text-muted-foreground">{task.remarks}</p>
              </div>
            )}

            {task.findings && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Findings</p>
                <p className="text-sm text-muted-foreground">{task.findings}</p>
              </div>
            )}

            {/* Verified Address */}
            {task.verifiedAddress && (
              <div className="space-y-1">
                <p className="text-sm font-medium flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  Verified Address
                </p>
                <p className="text-sm text-muted-foreground">
                  {task.verifiedAddress}
                </p>
              </div>
            )}

            {/* GPS Coordinates */}
            {task.gpsCoordinates && (
              <div className="space-y-1">
                <p className="text-sm font-medium flex items-center gap-1">
                  <Crosshair className="h-4 w-4" />
                  GPS Coordinates
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
                    {task.gpsCoordinates}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                      navigator.clipboard.writeText(task.gpsCoordinates!);
                      toast.success('GPS coordinates copied');
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            )}

            <Separator />

            {/* Timeline */}
            <div className="space-y-1">
              <p className="text-sm font-medium">Verification Timeline</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Created: </span>
                  <span className="font-medium">{new Date(task.createdAt).toLocaleString()}</span>
                </div>
                {task.startedAt && (
                  <div>
                    <span className="text-muted-foreground">Started: </span>
                    <span className="font-medium">{new Date(task.startedAt).toLocaleString()}</span>
                  </div>
                )}
                {task.completedAt && (
                  <div>
                    <span className="text-muted-foreground">Completed: </span>
                    <span className="font-medium">{new Date(task.completedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
              {task.assignedTo && (
                <p className="text-sm mt-1">
                  <span className="text-muted-foreground">Verified by: </span>
                  <span className="font-medium">
                    {task.assignedTo.firstName} {task.assignedTo.lastName} ({task.assignedTo.employeeId})
                  </span>
                </p>
              )}
            </div>

            {/* Photo Gallery */}
            {task.photos && task.photos.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-1">
                    <ImageIcon className="h-4 w-4" />
                    Photos ({task.photos.length})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {task.photos.map((photo, idx) => (
                      <div key={idx} className="aspect-square rounded-lg overflow-hidden border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo}
                          alt={`Verification photo ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
