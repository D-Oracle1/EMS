'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  Search,
  Users,
  RefreshCw,
  Eye,
  MoreHorizontal,
  KeyRound,
  Unlock,
  Plus,
  Pencil,
  FileText,
  History,
  Upload,
  Wallet,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getStaffCompensation, setStaffCompensation } from '@/actions/payroll.actions';
import { getSalaryGrades, getPayrollComponents } from '@/actions/hr-config.actions';
import { getStaffAssets } from '@/actions/hr-engagement.actions';
import { getStaffMovements } from '@/actions/hr-lifecycle.actions';
import { Textarea } from '@/components/ui/textarea';
import { formatDate, formatDateTime, formatCurrency } from '@/lib/utils';
import { getStaffList } from '@/actions/hr.actions';
import { resetStaffPassword, unlockAccount } from '@/actions/auth.actions';
import {
  createStaff,
  updateStaff,
  getDepartments,
  getRoles,
  getBranches,
  getStaffDocuments,
  getStaffActivityLogs,
} from '@/actions/staff.actions';
import { uploadDocument, getDocumentCategories } from '@/actions/document.actions';
import type { SessionUser } from '@/types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StaffMember {
  id: string;
  employeeId: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  phone?: string | null;
  dateOfBirth?: string | Date | null;
  gender?: string | null;
  address?: string | null;
  nationalId?: string | null;
  departmentId: string;
  roleId: string;
  branchId?: string | null;
  supervisorId?: string | null;
  hireDate?: string | Date | null;
  terminationDate?: string | Date | null;
  status: string;
  lastLoginAt?: string | Date | null;
  failedLoginAttempts?: number;
  lockedUntil?: string | Date | null;
  mustChangePassword?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  department?: { name: string } | null;
  role?: { name: string } | null;
  branch?: { name: string } | null;
}

interface Department {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  _count?: { staff: number };
}

interface Role {
  id: string;
  code: string;
  name: string;
  level: number;
  isActive: boolean;
  approvalLimit?: number | null;
}

interface Branch {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface DocumentCategory {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface StaffFormFields {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  phone: string;
  departmentId: string;
  roleId: string;
  branchId: string;
  supervisorId: string;
  dateOfBirth: string;
  gender: string;
  nationalId: string;
  address: string;
}

const emptyStaffForm: StaffFormFields = {
  firstName: '',
  lastName: '',
  middleName: '',
  email: '',
  phone: '',
  departmentId: '',
  roleId: '',
  branchId: '',
  supervisorId: '',
  dateOfBirth: '',
  gender: '',
  nationalId: '',
  address: '',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getStatusBadge(status: string) {
  switch (status) {
    case 'ACTIVE':
      return <Badge variant="success">Active</Badge>;
    case 'INACTIVE':
      return <Badge variant="secondary">Inactive</Badge>;
    case 'SUSPENDED':
      return <Badge variant="destructive">Suspended</Badge>;
    case 'TERMINATED':
      return <Badge variant="error">Terminated</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function StaffClient({ user }: { user: SessionUser }) {
  const [isPending, startTransition] = useTransition();

  // ---- data lists ----
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [documentCategories, setDocumentCategories] = useState<DocumentCategory[]>([]);

  // ---- filters ----
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');

  // ---- create dialog ----
  const [createOpen, setCreateOpen] = useState(false);
  const [newStaff, setNewStaff] = useState<StaffFormFields>({ ...emptyStaffForm });

  // ---- detail dialog ----
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  // Compensation tab
  const [compensations, setCompensations] = useState<any[]>([]);
  const [staffAssets, setStaffAssets] = useState<any[]>([]);
  const [staffMovements, setStaffMovements] = useState<any[]>([]);
  const [salaryGrades, setSalaryGrades] = useState<any[]>([]);
  const [payComponents, setPayComponents] = useState<any[]>([]);
  const [packageOpen, setPackageOpen] = useState(false);
  const [packageForm, setPackageForm] = useState<{
    gradeId: string;
    basicSalary: string;
    effectiveFrom: string;
    reason: string;
    items: Record<string, string>;
  }>({
    gradeId: '__none',
    basicSalary: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    reason: '',
    items: {},
  });
  const [detailTab, setDetailTab] = useState('info');
  const [staffDocuments, setStaffDocuments] = useState<any[]>([]);
  const [staffActivityLogs, setStaffActivityLogs] = useState<any[]>([]);

  // ---- edit dialog ----
  const [editOpen, setEditOpen] = useState(false);
  const [editStaff, setEditStaff] = useState<StaffFormFields>({ ...emptyStaffForm });
  const [editStaffId, setEditStaffId] = useState('');

  // ---- document upload dialog ----
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // ---- reset password dialog ----
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<StaffMember | null>(null);
  const [tempPassword, setTempPassword] = useState('');

  /* ---------------------------------------------------------------- */
  /*  Data fetching                                                    */
  /* ---------------------------------------------------------------- */

  const fetchStaff = () => {
    startTransition(async () => {
      try {
        const data = await getStaffList({
          search: search || undefined,
          status: statusFilter || undefined,
          departmentId: departmentFilter || undefined,
        });
        setStaffList(data as unknown as StaffMember[]);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load staff');
      }
    });
  };

  const fetchLookups = () => {
    startTransition(async () => {
      try {
        const [depts, rls, brs, cats] = await Promise.all([
          getDepartments(),
          getRoles(),
          getBranches(),
          getDocumentCategories(),
        ]);
        setDepartments(depts as unknown as Department[]);
        setRoles(rls as unknown as Role[]);
        setBranches(brs as unknown as Branch[]);
        setDocumentCategories(cats as unknown as DocumentCategory[]);
      } catch {
        // silently fail on lookups
      }
    });
  };

  useEffect(() => {
    fetchStaff();
    fetchLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStaffDocuments = (staffId: string) => {
    startTransition(async () => {
      try {
        const docs = await getStaffDocuments(staffId);
        setStaffDocuments(docs as any[]);
      } catch {
        setStaffDocuments([]);
      }
    });
  };

  const fetchStaffActivityLogs = (staffId: string) => {
    startTransition(async () => {
      try {
        const logs = await getStaffActivityLogs(staffId);
        setStaffActivityLogs(logs as any[]);
      } catch {
        setStaffActivityLogs([]);
      }
    });
  };

  /* ---------------------------------------------------------------- */
  /*  Handlers                                                         */
  /* ---------------------------------------------------------------- */

  const handleSearch = () => {
    fetchStaff();
  };

  const handleOpenDetail = (staff: StaffMember) => {
    setSelectedStaff(staff);
    setDetailTab('info');
    setStaffDocuments([]);
    setStaffActivityLogs([]);
    setCompensations([]);
    setStaffAssets([]);
    setStaffMovements([]);
    setDetailOpen(true);
    fetchStaffDocuments(staff.id);
    fetchStaffActivityLogs(staff.id);
    fetchEmploymentData(staff.id);
  };

  /**
   * Load the employment tab in one pass. Each call is independent, so a
   * permission failure on one (payroll, say) still leaves the others usable.
   */
  const fetchEmploymentData = (staffId: string) => {
    getStaffCompensation(staffId)
      .then(setCompensations)
      .catch(() => setCompensations([]));
    getStaffAssets(staffId)
      .then(setStaffAssets)
      .catch(() => setStaffAssets([]));
    getStaffMovements({ staffId })
      .then(setStaffMovements)
      .catch(() => setStaffMovements([]));
  };

  /** Open the package dialog, seeded from the current package where one exists. */
  const openPackageDialog = () => {
    if (!selectedStaff) return;

    Promise.all([getSalaryGrades(), getPayrollComponents()])
      .then(([grades, components]) => {
        setSalaryGrades(grades);
        setPayComponents(components);
      })
      .catch(() => undefined);

    const current = compensations.find((c) => c.isCurrent);
    const items: Record<string, string> = {};
    if (current) {
      for (const item of current.items) {
        items[item.componentId] = String(
          item.calculationType === 'FIXED' ? (item.amount ?? 0) : (item.percentage ?? 0)
        );
      }
    }

    setPackageForm({
      gradeId: current?.grade?.id ?? '__none',
      basicSalary: current ? String(current.basicSalary) : '',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      reason: '',
      items,
    });
    setPackageOpen(true);
  };

  const handleSavePackage = () => {
    if (!selectedStaff) return;

    const basic = parseFloat(packageForm.basicSalary);
    if (!Number.isFinite(basic) || basic <= 0) {
      toast.error('Enter a basic salary greater than zero');
      return;
    }

    // Only components the user actually filled in are sent.
    const items = Object.entries(packageForm.items)
      .filter(([, value]) => value.trim() !== '' && parseFloat(value) > 0)
      .map(([componentId, value]) => {
        const component = payComponents.find((c) => c.id === componentId);
        const numeric = parseFloat(value);
        return component?.calculationType === 'FIXED'
          ? { componentId, amount: numeric }
          : { componentId, percentage: numeric };
      });

    startTransition(async () => {
      const result = await setStaffCompensation({
        staffId: selectedStaff.id,
        gradeId: packageForm.gradeId === '__none' ? undefined : packageForm.gradeId,
        basicSalary: basic,
        effectiveFrom: packageForm.effectiveFrom,
        reason: packageForm.reason || undefined,
        items,
      });

      if (result.success) {
        toast.success(result.message);
        setPackageOpen(false);
        fetchEmploymentData(selectedStaff.id);
      } else {
        toast.error(result.error || 'Failed to save the salary package');
      }
    });
  };

  const handleCreate = () => {
    if (!newStaff.firstName || !newStaff.lastName || !newStaff.email || !newStaff.departmentId || !newStaff.roleId) {
      toast.error('First name, last name, email, department, and role are required');
      return;
    }

    startTransition(async () => {
      const result = await createStaff({
        firstName: newStaff.firstName,
        lastName: newStaff.lastName,
        middleName: newStaff.middleName || undefined,
        email: newStaff.email,
        phone: newStaff.phone || undefined,
        departmentId: newStaff.departmentId,
        roleId: newStaff.roleId,
        branchId: newStaff.branchId || undefined,
        supervisorId: newStaff.supervisorId || undefined,
        dateOfBirth: newStaff.dateOfBirth || undefined,
        gender: newStaff.gender || undefined,
        nationalId: newStaff.nationalId || undefined,
        address: newStaff.address || undefined,
      });
      if (result.success) {
        toast.success(result.message);
        setCreateOpen(false);
        setNewStaff({ ...emptyStaffForm });
        fetchStaff();
      } else {
        toast.error(result.error || 'Failed to create staff');
      }
    });
  };

  const handleOpenEdit = (staff: StaffMember) => {
    setEditStaffId(staff.id);
    setEditStaff({
      firstName: staff.firstName,
      lastName: staff.lastName,
      middleName: staff.middleName || '',
      email: staff.email,
      phone: staff.phone || '',
      departmentId: staff.departmentId,
      roleId: staff.roleId,
      branchId: staff.branchId || '',
      supervisorId: staff.supervisorId || '',
      dateOfBirth: '',
      gender: staff.gender || '',
      nationalId: staff.nationalId || '',
      address: staff.address || '',
    });
    setEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editStaff.firstName || !editStaff.lastName || !editStaff.email) {
      toast.error('First name, last name, and email are required');
      return;
    }

    startTransition(async () => {
      const result = await updateStaff(editStaffId, {
        firstName: editStaff.firstName,
        lastName: editStaff.lastName,
        middleName: editStaff.middleName || undefined,
        email: editStaff.email,
        phone: editStaff.phone || undefined,
        departmentId: editStaff.departmentId || undefined,
        roleId: editStaff.roleId || undefined,
        branchId: editStaff.branchId || undefined,
        supervisorId: editStaff.supervisorId || undefined,
        status: undefined,
        address: editStaff.address || undefined,
      });
      if (result.success) {
        toast.success(result.message);
        setEditOpen(false);
        fetchStaff();
        // If we had the detail open for this staff, refresh it
        if (selectedStaff?.id === editStaffId) {
          setDetailOpen(false);
        }
      } else {
        toast.error(result.error || 'Failed to update staff');
      }
    });
  };

  const handleResetPassword = (staff: StaffMember) => {
    setResetPasswordTarget(staff);
    setTempPassword('');
    setResetPasswordOpen(true);
  };

  const confirmResetPassword = () => {
    if (!resetPasswordTarget) return;

    startTransition(async () => {
      const result = await resetStaffPassword(resetPasswordTarget.id);
      if (result.success) {
        toast.success(result.message);
        setTempPassword((result.data as any)?.tempPassword || '');
      } else {
        toast.error(result.error || 'Failed to reset password');
      }
    });
  };

  const handleUnlock = (staff: StaffMember) => {
    startTransition(async () => {
      const result = await unlockAccount(staff.id);
      if (result.success) {
        toast.success(result.message);
        fetchStaff();
      } else {
        toast.error(result.error || 'Failed to unlock account');
      }
    });
  };

  const handleDocumentUpload = () => {
    if (!uploadFile || !uploadTitle || !uploadCategory || !selectedStaff) {
      toast.error('File, title, and category are required');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('title', uploadTitle);
      formData.append('categoryId', uploadCategory);
      if (uploadDescription) formData.append('description', uploadDescription);
      formData.append('staffId', selectedStaff.id);

      const result = await uploadDocument(formData);
      if (result.success) {
        toast.success(result.message);
        setUploadOpen(false);
        resetUploadForm();
        fetchStaffDocuments(selectedStaff.id);
      } else {
        toast.error(result.error || 'Upload failed');
      }
    });
  };

  const resetUploadForm = () => {
    setUploadTitle('');
    setUploadCategory('');
    setUploadDescription('');
    setUploadFile(null);
  };

  /* ---------------------------------------------------------------- */
  /*  Render helpers                                                   */
  /* ---------------------------------------------------------------- */

  const canManageUsers = user.permissions.includes('SYSTEM:USER_MANAGE');
  const canCreateStaff = user.permissions.includes('HR:STAFF_CREATE');
  const canUpdateStaff = user.permissions.includes('HR:STAFF_UPDATE');
  const canManagePayroll = user.permissions.includes('HR:PAYROLL_MANAGE');

  /* ---------------------------------------------------------------- */
  /*  JSX                                                              */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" />
            Staff Management
          </h1>
          <p className="text-muted-foreground">
            View, create, and manage staff accounts
          </p>
        </div>
        {canCreateStaff && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Staff
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Staff Member</DialogTitle>
                <DialogDescription>
                  Fill in the details to create a new staff account. A temporary password will be generated.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Personal Information */}
                <div className="space-y-2">
                  <Label htmlFor="create-firstName">First Name *</Label>
                  <Input
                    id="create-firstName"
                    value={newStaff.firstName}
                    onChange={(e) => setNewStaff({ ...newStaff, firstName: e.target.value })}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-lastName">Last Name *</Label>
                  <Input
                    id="create-lastName"
                    value={newStaff.lastName}
                    onChange={(e) => setNewStaff({ ...newStaff, lastName: e.target.value })}
                    placeholder="Last name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-middleName">Middle Name</Label>
                  <Input
                    id="create-middleName"
                    value={newStaff.middleName}
                    onChange={(e) => setNewStaff({ ...newStaff, middleName: e.target.value })}
                    placeholder="Middle name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-email">Email *</Label>
                  <Input
                    id="create-email"
                    type="email"
                    value={newStaff.email}
                    onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                    placeholder="Email address"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-phone">Phone</Label>
                  <Input
                    id="create-phone"
                    value={newStaff.phone}
                    onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                    placeholder="Phone number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-dateOfBirth">Date of Birth</Label>
                  <Input
                    id="create-dateOfBirth"
                    type="date"
                    value={newStaff.dateOfBirth}
                    onChange={(e) => setNewStaff({ ...newStaff, dateOfBirth: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-gender">Gender</Label>
                  <Select
                    value={newStaff.gender}
                    onValueChange={(value) => setNewStaff({ ...newStaff, gender: value })}
                  >
                    <SelectTrigger id="create-gender">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MALE">Male</SelectItem>
                      <SelectItem value="FEMALE">Female</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-nationalId">National ID</Label>
                  <Input
                    id="create-nationalId"
                    value={newStaff.nationalId}
                    onChange={(e) => setNewStaff({ ...newStaff, nationalId: e.target.value })}
                    placeholder="National ID number"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="create-address">Address</Label>
                  <Textarea
                    id="create-address"
                    value={newStaff.address}
                    onChange={(e) => setNewStaff({ ...newStaff, address: e.target.value })}
                    placeholder="Residential address"
                    rows={2}
                  />
                </div>

                {/* Organizational */}
                <div className="space-y-2">
                  <Label htmlFor="create-department">Department *</Label>
                  <Select
                    value={newStaff.departmentId}
                    onValueChange={(value) => setNewStaff({ ...newStaff, departmentId: value })}
                  >
                    <SelectTrigger id="create-department">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-role">Role *</Label>
                  <Select
                    value={newStaff.roleId}
                    onValueChange={(value) => setNewStaff({ ...newStaff, roleId: value })}
                  >
                    <SelectTrigger id="create-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-branch">Branch</Label>
                  <Select
                    value={newStaff.branchId}
                    onValueChange={(value) => setNewStaff({ ...newStaff, branchId: value })}
                  >
                    <SelectTrigger id="create-branch">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-supervisor">Supervisor</Label>
                  <Select
                    value={newStaff.supervisorId}
                    onValueChange={(value) => setNewStaff({ ...newStaff, supervisorId: value })}
                  >
                    <SelectTrigger id="create-supervisor">
                      <SelectValue placeholder="Select supervisor" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffList.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.firstName} {s.lastName} ({s.employeeId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreateOpen(false);
                    setNewStaff({ ...emptyStaffForm });
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={isPending}>
                  {isPending ? 'Creating...' : 'Create Staff'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filters Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, employee ID, or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-9"
                />
              </div>
            </div>
            <Select
              value={statusFilter || 'ALL'}
              onValueChange={(v) => setStatusFilter(v === 'ALL' ? '' : v)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
                <SelectItem value="TERMINATED">Terminated</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={departmentFilter || 'ALL'}
              onValueChange={(v) => setDepartmentFilter(v === 'ALL' ? '' : v)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleSearch} disabled={isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Staff Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            {staffList.length} Staff Member{staffList.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[60px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Users className="h-8 w-8" />
                      <p>{isPending ? 'Loading...' : 'No staff members found'}</p>
                      {search && (
                        <p className="text-sm">
                          Try adjusting your search or filters
                        </p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                staffList.map((staff) => (
                  <TableRow key={staff.id} className="cursor-pointer" onClick={() => handleOpenDetail(staff)}>
                    <TableCell className="font-mono text-sm">{staff.employeeId}</TableCell>
                    <TableCell className="font-medium">
                      {staff.firstName} {staff.lastName}
                      {staff.middleName ? ` ${staff.middleName}` : ''}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{staff.email}</TableCell>
                    <TableCell>{staff.department?.name || '-'}</TableCell>
                    <TableCell>{staff.role?.name || '-'}</TableCell>
                    <TableCell>{staff.branch?.name || '-'}</TableCell>
                    <TableCell>{getStatusBadge(staff.status)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenDetail(staff); }}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          {canUpdateStaff && staff.id !== user.id && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenEdit(staff); }}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {canManageUsers && (
                            <>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleResetPassword(staff); }}>
                                <KeyRound className="mr-2 h-4 w-4" />
                                Reset Password
                              </DropdownMenuItem>
                              {staff.lockedUntil && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleUnlock(staff); }}>
                                  <Unlock className="mr-2 h-4 w-4" />
                                  Unlock Account
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/*  Staff Detail Dialog                                          */}
      {/* ============================================================ */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {selectedStaff?.firstName} {selectedStaff?.lastName}
              <span className="text-muted-foreground font-normal text-sm ml-2">
                ({selectedStaff?.employeeId})
              </span>
            </DialogTitle>
            <DialogDescription>
              Staff member details, documents, and activity history
            </DialogDescription>
          </DialogHeader>

          <Tabs value={detailTab} onValueChange={setDetailTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="info">
                <Eye className="mr-2 h-4 w-4" />
                Info
              </TabsTrigger>
              <TabsTrigger value="employment">
                <Wallet className="mr-2 h-4 w-4" />
                Employment
              </TabsTrigger>
              <TabsTrigger value="documents">
                <FileText className="mr-2 h-4 w-4" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="activity">
                <History className="mr-2 h-4 w-4" />
                Activity
              </TabsTrigger>
            </TabsList>

            {/* ---- Employment Tab: package, assets and movement history ---- */}
            <TabsContent value="employment" className="space-y-5 mt-4">
              {/* Salary package */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Salary Package</h4>
                  {canManagePayroll && (
                    <Button size="sm" variant="outline" onClick={openPackageDialog}>
                      <Wallet className="mr-2 h-3.5 w-3.5" />
                      {compensations.some((c) => c.isCurrent) ? 'Revise' : 'Set Package'}
                    </Button>
                  )}
                </div>

                {compensations.length === 0 ? (
                  <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No salary package on file. This staff member will be skipped by payroll runs.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {compensations.map((comp) => (
                      <div
                        key={comp.id}
                        className={`rounded-md border p-3 ${comp.isCurrent ? 'border-primary/40 bg-primary/5' : ''}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="text-lg font-bold tabular-nums">
                              {formatCurrency(comp.basicSalary)}
                            </span>
                            <span className="ml-1 text-xs text-muted-foreground">basic / month</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {comp.grade && <Badge variant="outline">{comp.grade.name}</Badge>}
                            {comp.isCurrent ? (
                              <Badge variant="success">Current</Badge>
                            ) : (
                              <Badge variant="secondary">Historical</Badge>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Effective {formatDate(comp.effectiveFrom)}
                          {comp.effectiveTo ? ` to ${formatDate(comp.effectiveTo)}` : ''} · set by{' '}
                          {comp.createdBy}
                          {comp.reason ? ` · ${comp.reason}` : ''}
                        </p>
                        {comp.items.length > 0 && (
                          <div className="mt-2 space-y-1 border-t pt-2">
                            {comp.items.map((item: any) => (
                              <div key={item.id} className="flex justify-between text-xs">
                                <span>
                                  {item.name}
                                  <span className="ml-1 text-muted-foreground">
                                    ({item.type.toLowerCase().replace(/_/g, ' ')})
                                  </span>
                                </span>
                                <span className="tabular-nums">
                                  {item.calculationType === 'FIXED'
                                    ? formatCurrency(item.amount ?? 0)
                                    : `${item.percentage ?? 0}%`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Assets held */}
              <div>
                <h4 className="mb-2 text-sm font-semibold">
                  Company Assets Held
                  <Badge variant="secondary" className="ml-2">{staffAssets.length}</Badge>
                </h4>
                {staffAssets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No assets currently assigned.</p>
                ) : (
                  <div className="space-y-2">
                    {staffAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className={`flex items-center justify-between rounded-md border p-2.5 text-sm ${asset.isOverdue ? 'border-amber-500/40 bg-amber-500/5' : ''}`}
                      >
                        <div className="min-w-0">
                          <span className="font-medium">{asset.name}</span>
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {asset.assetTag}
                          </span>
                          <div className="text-xs text-muted-foreground">
                            Issued {formatDate(asset.assignedAt)}
                            {asset.dueReturnAt ? ` · due ${formatDate(asset.dueReturnAt)}` : ''}
                          </div>
                        </div>
                        {asset.isOverdue && <Badge variant="warning">Overdue</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Movement history */}
              <div>
                <h4 className="mb-2 text-sm font-semibold">
                  Movement History
                  <Badge variant="secondary" className="ml-2">{staffMovements.length}</Badge>
                </h4>
                {staffMovements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recorded movements.</p>
                ) : (
                  <div className="space-y-2">
                    {staffMovements.map((movement) => (
                      <div key={movement.id} className="rounded-md border p-2.5 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge variant="outline">{movement.type.replace(/_/g, ' ')}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(movement.effectiveDate)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs">{movement.reason}</p>
                        {movement.toRole && movement.fromRole !== movement.toRole && (
                          <p className="text-xs text-muted-foreground">
                            {movement.fromRole} &rarr; {movement.toRole}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ---- Info Tab ---- */}
            <TabsContent value="info" className="space-y-4 mt-4">
              {selectedStaff && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Full Name</p>
                    <p className="font-medium">
                      {selectedStaff.firstName}
                      {selectedStaff.middleName ? ` ${selectedStaff.middleName}` : ''}{' '}
                      {selectedStaff.lastName}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{selectedStaff.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{selectedStaff.phone || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Employee ID</p>
                    <p className="font-mono font-medium">{selectedStaff.employeeId}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Department</p>
                    <p className="font-medium">{selectedStaff.department?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Role</p>
                    <p className="font-medium">{selectedStaff.role?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Branch</p>
                    <p className="font-medium">{selectedStaff.branch?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <div>{getStatusBadge(selectedStaff.status)}</div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Hire Date</p>
                    <p className="font-medium">
                      {selectedStaff.hireDate ? formatDate(selectedStaff.hireDate as string) : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Gender</p>
                    <p className="font-medium">
                      {selectedStaff.gender
                        ? selectedStaff.gender.charAt(0) + selectedStaff.gender.slice(1).toLowerCase()
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date of Birth</p>
                    <p className="font-medium">
                      {selectedStaff.dateOfBirth
                        ? formatDate(selectedStaff.dateOfBirth as string)
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">National ID</p>
                    <p className="font-medium">{selectedStaff.nationalId || '-'}</p>
                  </div>
                  {selectedStaff.address && (
                    <div className="sm:col-span-2">
                      <p className="text-sm text-muted-foreground">Address</p>
                      <p className="font-medium">{selectedStaff.address}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Last Login</p>
                    <p className="font-medium">
                      {selectedStaff.lastLoginAt
                        ? formatDateTime(selectedStaff.lastLoginAt as string)
                        : 'Never'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Account Locked</p>
                    <p className="font-medium">
                      {selectedStaff.lockedUntil ? (
                        <Badge variant="destructive">
                          Locked until {formatDateTime(selectedStaff.lockedUntil as string)}
                        </Badge>
                      ) : (
                        <Badge variant="success">Not Locked</Badge>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Must Change Password</p>
                    <p className="font-medium">
                      {selectedStaff.mustChangePassword ? (
                        <Badge variant="warning">Yes</Badge>
                      ) : (
                        <Badge variant="outline">No</Badge>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Failed Login Attempts</p>
                    <p className="font-medium">{selectedStaff.failedLoginAttempts ?? 0}</p>
                  </div>
                </div>
              )}

              {/* Detail action buttons */}
              <div className="flex gap-2 pt-4 border-t">
                {canUpdateStaff && selectedStaff && selectedStaff.id !== user.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDetailOpen(false);
                      handleOpenEdit(selectedStaff);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                )}
                {canManageUsers && selectedStaff && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDetailOpen(false);
                        handleResetPassword(selectedStaff);
                      }}
                    >
                      <KeyRound className="mr-2 h-4 w-4" />
                      Reset Password
                    </Button>
                    {selectedStaff.lockedUntil && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnlock(selectedStaff)}
                      >
                        <Unlock className="mr-2 h-4 w-4" />
                        Unlock
                      </Button>
                    )}
                  </>
                )}
              </div>
            </TabsContent>

            {/* ---- Documents Tab ---- */}
            <TabsContent value="documents" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {staffDocuments.length} document{staffDocuments.length !== 1 ? 's' : ''} found
                </p>
                {user.permissions.includes('DOCUMENTS:CREATE') && (
                  <Button size="sm" onClick={() => setUploadOpen(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                  </Button>
                )}
              </div>

              {staffDocuments.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <FileText className="mx-auto h-8 w-8 mb-2" />
                  <p>No documents found for this staff member</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Uploaded By</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffDocuments.map((doc: any) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          {doc.title}
                          <div className="text-xs text-muted-foreground">{doc.fileName}</div>
                        </TableCell>
                        <TableCell>{doc.category?.name || '-'}</TableCell>
                        <TableCell>
                          {doc.uploadedBy
                            ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`
                            : '-'}
                        </TableCell>
                        <TableCell>{formatDate(doc.createdAt)}</TableCell>
                        <TableCell>
                          {doc.filePath && (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={doc.filePath} target="_blank" rel="noopener noreferrer">
                                <Eye className="mr-1 h-4 w-4" />
                                View
                              </a>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* ---- Activity Tab ---- */}
            <TabsContent value="activity" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                {staffActivityLogs.length} activity log{staffActivityLogs.length !== 1 ? 's' : ''}
              </p>

              {staffActivityLogs.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <History className="mx-auto h-8 w-8 mb-2" />
                  <p>No activity logs found</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {staffActivityLogs.map((log: any) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-3 rounded-lg border text-sm"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {log.action}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {log.module}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(log.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1">{log.description}</p>
                        {log.entityType && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {log.entityType}
                            {log.entityId ? `: ${log.entityId.slice(0, 8)}...` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/*  Edit Staff Dialog                                            */}
      {/* ============================================================ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
            <DialogDescription>
              Update the staff member's details.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-firstName">First Name *</Label>
              <Input
                id="edit-firstName"
                value={editStaff.firstName}
                onChange={(e) => setEditStaff({ ...editStaff, firstName: e.target.value })}
                placeholder="First name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lastName">Last Name *</Label>
              <Input
                id="edit-lastName"
                value={editStaff.lastName}
                onChange={(e) => setEditStaff({ ...editStaff, lastName: e.target.value })}
                placeholder="Last name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-middleName">Middle Name</Label>
              <Input
                id="edit-middleName"
                value={editStaff.middleName}
                onChange={(e) => setEditStaff({ ...editStaff, middleName: e.target.value })}
                placeholder="Middle name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email *</Label>
              <Input
                id="edit-email"
                type="email"
                value={editStaff.email}
                onChange={(e) => setEditStaff({ ...editStaff, email: e.target.value })}
                placeholder="Email address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={editStaff.phone}
                onChange={(e) => setEditStaff({ ...editStaff, phone: e.target.value })}
                placeholder="Phone number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-gender">Gender</Label>
              <Select
                value={editStaff.gender || ''}
                onValueChange={(value) => setEditStaff({ ...editStaff, gender: value })}
              >
                <SelectTrigger id="edit-gender">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-nationalId">National ID</Label>
              <Input
                id="edit-nationalId"
                value={editStaff.nationalId}
                onChange={(e) => setEditStaff({ ...editStaff, nationalId: e.target.value })}
                placeholder="National ID number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-department">Department</Label>
              <Select
                value={editStaff.departmentId}
                onValueChange={(value) => setEditStaff({ ...editStaff, departmentId: value })}
              >
                <SelectTrigger id="edit-department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-address">Address</Label>
              <Textarea
                id="edit-address"
                value={editStaff.address}
                onChange={(e) => setEditStaff({ ...editStaff, address: e.target.value })}
                placeholder="Residential address"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={editStaff.roleId}
                onValueChange={(value) => setEditStaff({ ...editStaff, roleId: value })}
              >
                <SelectTrigger id="edit-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-branch">Branch</Label>
              <Select
                value={editStaff.branchId}
                onValueChange={(value) => setEditStaff({ ...editStaff, branchId: value })}
              >
                <SelectTrigger id="edit-branch">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-supervisor">Supervisor</Label>
              <Select
                value={editStaff.supervisorId}
                onValueChange={(value) => setEditStaff({ ...editStaff, supervisorId: value })}
              >
                <SelectTrigger id="edit-supervisor">
                  <SelectValue placeholder="Select supervisor" />
                </SelectTrigger>
                <SelectContent>
                  {staffList
                    .filter((s) => s.id !== editStaffId)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.firstName} {s.lastName} ({s.employeeId})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/*  Reset Password Dialog                                        */}
      {/* ============================================================ */}
      <Dialog
        open={resetPasswordOpen}
        onOpenChange={(open) => {
          if (!open) {
            setResetPasswordOpen(false);
            setResetPasswordTarget(null);
            setTempPassword('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Reset Password
            </DialogTitle>
            <DialogDescription>
              Reset the password for{' '}
              <strong>
                {resetPasswordTarget?.firstName} {resetPasswordTarget?.lastName}
              </strong>{' '}
              ({resetPasswordTarget?.employeeId}). A temporary password will be generated.
            </DialogDescription>
          </DialogHeader>

          {tempPassword ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Password reset successfully!
                </p>
                <p className="text-sm mt-2">Temporary password:</p>
                <code className="block mt-1 p-2 bg-white dark:bg-gray-900 rounded border text-lg font-mono select-all">
                  {tempPassword}
                </code>
                <p className="text-xs mt-2 text-muted-foreground">
                  The user will be required to change this password on their next login. Please
                  share this securely.
                </p>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setResetPasswordOpen(false);
                    setResetPasswordTarget(null);
                    setTempPassword('');
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setResetPasswordOpen(false);
                  setResetPasswordTarget(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmResetPassword}
                disabled={isPending}
              >
                {isPending ? 'Resetting...' : 'Reset Password'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/*  Document Upload Dialog (from detail view)                    */}
      {/* ============================================================ */}
      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          if (!open) {
            setUploadOpen(false);
            resetUploadForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Staff Document
            </DialogTitle>
            <DialogDescription>
              Upload a document for{' '}
              <strong>
                {selectedStaff?.firstName} {selectedStaff?.lastName}
              </strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="upload-file">File</Label>
              <Input
                id="upload-file"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-title">Title</Label>
              <Input
                id="upload-title"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="Document title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-category">Category</Label>
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger id="upload-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {documentCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-description">Description (optional)</Label>
              <Textarea
                id="upload-description"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="Brief description..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUploadOpen(false);
                resetUploadForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleDocumentUpload} disabled={isPending}>
              {isPending ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Salary Package Dialog ---- */}
      <Dialog open={packageOpen} onOpenChange={setPackageOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Salary Package</DialogTitle>
            <DialogDescription>
              {selectedStaff
                ? `${selectedStaff.firstName} ${selectedStaff.lastName} (${selectedStaff.employeeId})`
                : ''}
              . The current package is closed off the day before this one takes effect.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pk-basic">Basic Salary (monthly)</Label>
                <Input
                  id="pk-basic"
                  type="number"
                  min={0}
                  value={packageForm.basicSalary}
                  onChange={(e) =>
                    setPackageForm({ ...packageForm, basicSalary: e.target.value })
                  }
                  placeholder="250000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pk-grade">Salary Grade</Label>
                <Select
                  value={packageForm.gradeId}
                  onValueChange={(v) => setPackageForm({ ...packageForm, gradeId: v })}
                >
                  <SelectTrigger id="pk-grade">
                    <SelectValue placeholder="No grade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No grade</SelectItem>
                    {salaryGrades.map((grade: any) => (
                      <SelectItem key={grade.id} value={grade.id}>
                        {grade.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pk-from">Effective From</Label>
                <Input
                  id="pk-from"
                  type="date"
                  value={packageForm.effectiveFrom}
                  onChange={(e) =>
                    setPackageForm({ ...packageForm, effectiveFrom: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pk-reason">Reason</Label>
                <Input
                  id="pk-reason"
                  value={packageForm.reason}
                  onChange={(e) => setPackageForm({ ...packageForm, reason: e.target.value })}
                  placeholder="Annual review"
                />
              </div>
            </div>

            <div>
              <h4 className="mb-1 text-sm font-medium">Allowances & Deductions</h4>
              <p className="mb-3 text-xs text-muted-foreground">
                Leave a component blank to exclude it. PAYE, pension, NHF and loss of pay are
                computed automatically and are not listed here.
              </p>

              <div className="space-y-2">
                {payComponents.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No payroll components configured yet.
                  </p>
                )}
                {payComponents.map((component: any) => (
                  <div
                    key={component.id}
                    className="grid grid-cols-[1fr,140px] items-center gap-3 rounded-md border p-2.5"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{component.name}</span>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        <Badge
                          variant={
                            component.type === 'EARNING'
                              ? 'success'
                              : component.type === 'DEDUCTION'
                                ? 'error'
                                : 'purple'
                          }
                          className="text-[10px]"
                        >
                          {component.type.replace(/_/g, ' ').toLowerCase()}
                        </Badge>
                        {component.isPensionable && (
                          <Badge variant="outline" className="text-[10px]">
                            pensionable
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      value={packageForm.items[component.id] ?? ''}
                      onChange={(e) =>
                        setPackageForm({
                          ...packageForm,
                          items: { ...packageForm.items, [component.id]: e.target.value },
                        })
                      }
                      placeholder={
                        component.calculationType === 'FIXED'
                          ? 'Amount'
                          : `% of ${component.calculationType === 'PERCENT_OF_BASIC' ? 'basic' : 'gross'}`
                      }
                      className="tabular-nums"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPackageOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePackage} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
