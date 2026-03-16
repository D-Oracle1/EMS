'use client';

import { useEffect, useState, useTransition, useRef } from 'react';
import {
  FileText,
  Upload,
  Search,
  RefreshCw,
  Download,
  Eye,
  Trash2,
  CheckCircle,
  History,
  X,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  getDocuments,
  getDocumentCategories,
  uploadDocument,
  approveDocument,
  softDeleteDocument,
} from '@/actions/document.actions';
import { PermissionGate } from '@/components/permission-gate';
import type { SessionUser } from '@/types';

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'secondary' | 'default'> = {
  DRAFT: 'secondary',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  ARCHIVED: 'default',
  SUPERSEDED: 'error',
};

interface DocumentsClientProps {
  user: SessionUser;
}

export function DocumentsClient({ user }: DocumentsClientProps) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isPending, startTransition] = useTransition();

  // Upload dialog state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadCustomerId, setUploadCustomerId] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const fetchDocuments = (page = 1) => {
    startTransition(async () => {
      try {
        const result = await getDocuments({
          search: search || undefined,
          categoryId: categoryFilter || undefined,
          status: statusFilter || undefined,
          page,
          limit: 20,
        });
        setDocuments(result.data);
        setPagination(result.pagination);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load documents');
      }
    });
  };

  const fetchCategories = () => {
    startTransition(async () => {
      try {
        const data = await getDocumentCategories();
        setCategories(data);
      } catch {
        // Silently fail - categories are optional for filtering
      }
    });
  };

  useEffect(() => {
    fetchDocuments(1);
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = () => {
    if (!uploadFile || !uploadTitle || !uploadCategory) {
      toast.error('File, title, and category are required');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('title', uploadTitle);
      formData.append('categoryId', uploadCategory);
      if (uploadDescription) formData.append('description', uploadDescription);
      if (uploadCustomerId) formData.append('customerId', uploadCustomerId);

      const result = await uploadDocument(formData);
      if (result.success) {
        toast.success(result.message);
        setUploadOpen(false);
        resetUploadForm();
        fetchDocuments(1);
      } else {
        toast.error(result.error || 'Upload failed');
      }
    });
  };

  const resetUploadForm = () => {
    setUploadTitle('');
    setUploadCategory('');
    setUploadDescription('');
    setUploadCustomerId('');
    setUploadFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleApprove = (id: string) => {
    startTransition(async () => {
      const result = await approveDocument(id);
      if (result.success) {
        toast.success(result.message);
        fetchDocuments(pagination.page);
      } else {
        toast.error(result.error || 'Failed to approve');
      }
    });
  };

  const handleDelete = () => {
    if (!deleteTarget || !deleteReason.trim()) {
      toast.error('Please provide a reason for deletion');
      return;
    }
    startTransition(async () => {
      const result = await softDeleteDocument(deleteTarget.id, deleteReason.trim());
      if (result.success) {
        toast.success(result.message);
        setDeleteTarget(null);
        setDeleteReason('');
        fetchDocuments(pagination.page);
      } else {
        toast.error(result.error || 'Failed to delete');
      }
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Document Archive</h1>
          <p className="text-muted-foreground">
            Upload, manage, and search organizational documents
          </p>
        </div>
        <PermissionGate permission="DOCUMENTS:CREATE">
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="mr-2 h-4 w-4" />
                Upload Document
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Upload Document</DialogTitle>
                <DialogDescription>Upload a new document to the archive.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="doc-file">File</Label>
                  <Input
                    id="doc-file"
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doc-title">Title</Label>
                  <Input id="doc-title" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="Document title" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doc-category">Category</Label>
                  <Select value={uploadCategory} onValueChange={setUploadCategory}>
                    <SelectTrigger id="doc-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doc-desc">Description (optional)</Label>
                  <Textarea id="doc-desc" value={uploadDescription} onChange={(e) => setUploadDescription(e.target.value)} placeholder="Brief description..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="doc-customer">Customer ID (optional)</Label>
                  <Input id="doc-customer" value={uploadCustomerId} onChange={(e) => setUploadCustomerId(e.target.value)} placeholder="Link to customer" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setUploadOpen(false); resetUploadForm(); }}>Cancel</Button>
                <Button onClick={handleUpload} disabled={isPending}>
                  {isPending ? 'Uploading...' : 'Upload'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </PermissionGate>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            All Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, document #, or file name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchDocuments(1)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v === 'ALL' ? '' : v)}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === 'ALL' ? '' : v)}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="PENDING_APPROVAL">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => fetchDocuments(1)} disabled={isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
              Search
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doc #</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Uploaded By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {isPending ? 'Loading...' : 'No documents found'}
                  </TableCell>
                </TableRow>
              )}
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-mono text-sm">{doc.documentNumber}</TableCell>
                  <TableCell>
                    <div className="font-medium">{doc.title}</div>
                    {doc.customer && (
                      <div className="text-xs text-muted-foreground">
                        {doc.customer.firstName} {doc.customer.lastName}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{doc.category?.name}</TableCell>
                  <TableCell>
                    <div className="text-sm">{doc.fileName}</div>
                    <div className="text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</div>
                  </TableCell>
                  <TableCell>
                    {doc.uploadedBy?.firstName} {doc.uploadedBy?.lastName}
                  </TableCell>
                  <TableCell>{formatDate(doc.uploadedAt)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[doc.status] || 'default'}>
                      {doc.status.replace(/_/g, ' ')}
                    </Badge>
                    {doc.version > 1 && (
                      <Badge variant="outline" className="ml-1 text-xs">v{doc.version}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">Actions</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <a href={doc.filePath} target="_blank" rel="noopener noreferrer">
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </a>
                        </DropdownMenuItem>
                        {(doc.status === 'DRAFT' || doc.status === 'PENDING_APPROVAL') &&
                          user.permissions.includes('DOCUMENTS:APPROVE') && (
                          <DropdownMenuItem onClick={() => handleApprove(doc.id)}>
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Approve
                          </DropdownMenuItem>
                        )}
                        {doc.status !== 'APPROVED' && user.permissions.includes('DOCUMENTS:DELETE') && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteTarget(doc)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => fetchDocuments(pagination.page - 1)} disabled={pagination.page <= 1 || isPending}>
                  Previous
                </Button>
                <span className="text-sm">Page {pagination.page} of {pagination.totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => fetchDocuments(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages || isPending}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              This will soft-delete the document. It can be recovered by an administrator.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">
              Document: <strong>{deleteTarget?.documentNumber}</strong> - {deleteTarget?.title}
            </p>
            <div className="space-y-2">
              <Label htmlFor="delete-reason">Reason for deletion</Label>
              <Textarea
                id="delete-reason"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Provide a reason..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteReason(''); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending || !deleteReason.trim()}>
              {isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
