import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DocumentIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  CloudArrowUpIcon,
  EyeIcon,
  TrashIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const fileTypeIcons: Record<string, string> = {
  'application/pdf': '📄',
  'image/jpeg': '🖼️',
  'image/png': '🖼️',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.ms-excel': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
};

export default function Documents() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ['document-categories'],
    queryFn: async () => {
      const response = await api.get('/documents/categories');
      return response.data.data;
    },
    enabled: hasPermission('DOCUMENTS:VIEW'),
  });

  const { data: documents, isLoading } = useQuery({
    queryKey: ['documents', searchTerm, selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedCategory) params.append('categoryId', selectedCategory);
      const response = await api.get('/documents?' + params.toString());
      return response.data;
    },
    enabled: hasPermission('DOCUMENTS:VIEW'),
  });

  const uploadDocument = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Document uploaded successfully');
      setShowUploadModal(false);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to upload document');
    },
  });

  const deleteDocument = useMutation({
    mutationFn: (id: string) => api.delete('/documents/' + id),
    onSuccess: () => {
      toast.success('Document deleted');
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete document');
    },
  });

  const handleUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    uploadDocument.mutate(formData);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (!hasPermission('DOCUMENTS:VIEW')) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">You don't have permission to view documents.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Archive</h1>
          <p className="text-gray-500">Manage and search archived documents</p>
        </div>
        {hasPermission('DOCUMENTS:UPLOAD') && (
          <button onClick={() => setShowUploadModal(true)} className="btn-primary">
            <CloudArrowUpIcon className="h-5 w-5 mr-2" />
            Upload Document
          </button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="input w-48"
          >
            <option value="">All Categories</option>
            {categories?.map((cat: any) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory('')}
          className={clsx(
            'px-4 py-2 rounded-full text-sm font-medium transition-colors',
            !selectedCategory ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          )}
        >
          All
        </button>
        {categories?.map((cat: any) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={clsx(
              'px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2',
              selectedCategory === cat.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            <FolderIcon className="h-4 w-4" />
            {cat.name}
            <span className="bg-white bg-opacity-20 px-2 py-0.5 rounded-full text-xs">
              {cat._count?.documents || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Document Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {documents?.data?.map((doc: any) => (
            <div key={doc.id} className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center text-2xl">
                    {fileTypeIcons[doc.mimeType] || '📄'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate" title={doc.originalName}>
                      {doc.originalName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(doc.size)} • {new Date(doc.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
              {doc.description && (
                <p className="text-sm text-gray-500 mt-2 line-clamp-2">{doc.description}</p>
              )}
              <div className="flex items-center justify-between mt-4 pt-3 border-t">
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <FolderIcon className="h-4 w-4" />
                  {doc.category?.name || 'Uncategorized'}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => window.open('/api/v1/documents/' + doc.id + '/download', '_blank')}
                    className="p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded"
                    title="Download"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => window.open('/api/v1/documents/' + doc.id + '/view', '_blank')}
                    className="p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded"
                    title="View"
                  >
                    <EyeIcon className="h-4 w-4" />
                  </button>
                  {hasPermission('DOCUMENTS:DELETE') && (
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this document?')) {
                          deleteDocument.mutate(doc.id);
                        }
                      }}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {(!documents?.data || documents.data.length === 0) && (
            <div className="col-span-full card p-12 text-center">
              <DocumentIcon className="h-12 w-12 text-gray-400 mx-auto" />
              <p className="mt-4 text-gray-500">No documents found.</p>
            </div>
          )}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-medium mb-4">Upload Document</h3>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  File *
                </label>
                <input
                  type="file"
                  name="file"
                  required
                  className="input w-full"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Supported: PDF, Word, Excel, Images (max 10MB)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category *
                </label>
                <select name="categoryId" required className="input w-full">
                  <option value="">Select category</option>
                  {categories?.map((cat: any) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference Type
                </label>
                <select name="referenceType" className="input w-full">
                  <option value="">None</option>
                  <option value="CUSTOMER">Customer</option>
                  <option value="LOAN">Loan</option>
                  <option value="SAVINGS">Savings Account</option>
                  <option value="FIXED_DEPOSIT">Fixed Deposit</option>
                  <option value="STAFF">Staff</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference ID
                </label>
                <input
                  type="text"
                  name="referenceId"
                  placeholder="e.g., Customer ID, Loan Number"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={2}
                  placeholder="Brief description of the document..."
                  className="input w-full"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadDocument.isPending}
                  className="btn-primary"
                >
                  {uploadDocument.isPending ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
