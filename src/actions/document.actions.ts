'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission, getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { generateReference } from '@/lib/utils';
import { put, del } from '@vercel/blob';
import { createHash } from 'crypto';
import type { ActionResult } from '@/types';

export async function uploadDocument(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission('DOCUMENTS:CREATE');

    const file = formData.get('file') as File;
    if (!file) return { success: false, error: 'No file provided' };

    const title = formData.get('title') as string;
    const categoryId = formData.get('categoryId') as string;
    const description = formData.get('description') as string | null;
    const customerId = formData.get('customerId') as string | null;
    const loanId = formData.get('loanId') as string | null;
    const staffId = formData.get('staffId') as string | null;
    const departmentCode = formData.get('departmentCode') as string | null;
    const isConfidential = formData.get('isConfidential') === 'true';

    if (!title || !categoryId) {
      return { success: false, error: 'Title and category are required' };
    }

    // Read file for checksum
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const checksum = createHash('sha256').update(buffer).digest('hex');

    // Upload to Vercel Blob
    const blob = await put(`documents/${Date.now()}-${file.name}`, buffer, {
      access: 'public',
      contentType: file.type,
    });

    const documentNumber = await generateReference('DOCUMENT');

    const doc = await prisma.document.create({
      data: {
        documentNumber,
        categoryId,
        title,
        description,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        filePath: blob.url,
        checksum,
        customerId: customerId || undefined,
        loanId: loanId || undefined,
        staffId: staffId || undefined,
        departmentCode: departmentCode || undefined,
        isConfidential,
        uploadedById: user.id,
        status: 'DRAFT',
      },
    });

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'DOCUMENTS',
      entityType: 'DOCUMENT', entityId: doc.id,
      description: `Uploaded document: ${title} (${documentNumber})`,
      newValues: { fileName: file.name, fileSize: file.size, categoryId },
    });

    return { success: true, message: `Document uploaded: ${documentNumber}`, data: { id: doc.id, documentNumber } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getDocuments(filters?: {
  search?: string;
  categoryId?: string;
  status?: string;
  customerId?: string;
  loanId?: string;
  page?: number;
  limit?: number;
}) {
  await requirePermission('DOCUMENTS:READ');

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { isDeleted: false };
  if (filters?.categoryId) where.categoryId = filters.categoryId;
  if (filters?.status) where.status = filters.status;
  if (filters?.customerId) where.customerId = filters.customerId;
  if (filters?.loanId) where.loanId = filters.loanId;
  if (filters?.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
      { documentNumber: { contains: filters.search, mode: 'insensitive' } },
      { fileName: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.document.findMany({
      where: where as any,
      include: {
        category: { select: { name: true } },
        customer: { select: { firstName: true, lastName: true, customerNumber: true } },
        uploadedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.document.count({ where: where as any }),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getDocument(id: string) {
  await requirePermission('DOCUMENTS:READ');

  const doc = await prisma.document.findUnique({
    where: { id, isDeleted: false },
    include: {
      category: true,
      customer: { select: { firstName: true, lastName: true, customerNumber: true } },
      loan: { select: { loanNumber: true } },
      uploadedBy: { select: { firstName: true, lastName: true } },
      versions: { orderBy: { version: 'desc' } },
    },
  });

  if (!doc) throw new Error('Document not found');
  return doc;
}

export async function approveDocument(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('DOCUMENTS:APPROVE');

    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return { success: false, error: 'Document not found' };
    if (doc.status !== 'DRAFT' && doc.status !== 'PENDING_APPROVAL') {
      return { success: false, error: 'Document cannot be approved in current status' };
    }

    await prisma.document.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() },
    });

    await auditLog({
      userId: user.id, action: 'APPROVE', module: 'DOCUMENTS',
      entityType: 'DOCUMENT', entityId: id,
      description: `Approved document: ${doc.documentNumber}`,
    });

    return { success: true, message: 'Document approved' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function softDeleteDocument(id: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('DOCUMENTS:DELETE');

    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return { success: false, error: 'Document not found' };
    if (doc.status === 'APPROVED') return { success: false, error: 'Cannot delete approved documents' };

    await prisma.document.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), deletedById: user.id, deletionReason: reason },
    });

    await auditLog({
      userId: user.id, action: 'DELETE', module: 'DOCUMENTS',
      entityType: 'DOCUMENT', entityId: id,
      description: `Soft deleted document: ${doc.documentNumber}. Reason: ${reason}`,
    });

    return { success: true, message: 'Document deleted' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function uploadNewVersion(documentId: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission('DOCUMENTS:CREATE');

    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) return { success: false, error: 'Document not found' };

    const file = formData.get('file') as File;
    if (!file) return { success: false, error: 'No file provided' };

    const changeNotes = formData.get('changeNotes') as string | null;

    // Save current version as a history record
    await prisma.documentVersion.create({
      data: {
        documentId,
        version: doc.version,
        fileName: doc.fileName,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        filePath: doc.filePath,
        checksum: doc.checksum,
        uploadedById: doc.uploadedById,
        changeNotes: changeNotes || undefined,
      },
    });

    // Upload new file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const checksum = createHash('sha256').update(buffer).digest('hex');

    const blob = await put(`documents/${Date.now()}-${file.name}`, buffer, {
      access: 'public',
      contentType: file.type,
    });

    // Update document with new file
    await prisma.document.update({
      where: { id: documentId },
      data: {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        filePath: blob.url,
        checksum,
        version: { increment: 1 },
        previousVersionId: documentId,
        status: 'DRAFT', // Reset to draft on new version
      },
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'DOCUMENTS',
      entityType: 'DOCUMENT', entityId: documentId,
      description: `Uploaded new version (v${doc.version + 1}) for ${doc.documentNumber}`,
    });

    return { success: true, message: `Version ${doc.version + 1} uploaded` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getDocumentCategories() {
  const { user: _ } = await getSession();

  return prisma.documentCategory.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: { _count: { select: { documents: true } } },
  });
}
