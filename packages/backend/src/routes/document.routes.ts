/**
 * Hylink EMS - Document Archive Routes
 * Secure digital archive for all documents
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { createHash } from 'crypto';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { prisma } from '../lib/prisma.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validateBody, asyncHandler } from '../middleware/errorHandler.js';
import { auditEntityChange } from '../middleware/audit.js';
import { AuthenticatedRequest } from '../types/index.js';
import { generateReference, sanitizeFilename } from '../utils/helpers.js';
import { config } from '../config/index.js';

const router = Router();

router.use(authenticate as any);

// Ensure upload directory exists
const uploadDir = config.uploadPath;
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const dir = join(uploadDir, String(year), month);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitized = sanitizeFilename(file.originalname);
    cb(null, `${uniqueSuffix}-${sanitized}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSizeMb * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = config.allowedFileTypes.split(',');
    const ext = file.originalname.split('.').pop()?.toLowerCase() || '';

    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type .${ext} is not allowed`));
    }
  },
});

// Validation schemas
const documentMetadataSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  customerId: z.string().uuid().optional(),
  loanId: z.string().uuid().optional(),
  documentDate: z.string().datetime().transform(s => new Date(s)).optional(),
  expiryDate: z.string().datetime().transform(s => new Date(s)).optional(),
  isConfidential: z.boolean().default(false),
});

const updateDocumentSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  isConfidential: z.boolean().optional(),
});

/**
 * GET /api/v1/documents/categories
 * Get document categories
 */
router.get(
  '/categories',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const categories = await prisma.documentCategory.findMany({
      where: { isActive: true },
      include: {
        children: { where: { isActive: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      success: true,
      data: categories,
    });
  })
);

/**
 * POST /api/v1/documents
 * Upload new document
 */
router.post(
  '/',
  requirePermission('DOCUMENTS:UPLOAD'),
  upload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    // Parse and validate metadata
    const metadata = documentMetadataSchema.parse(JSON.parse(req.body.metadata || '{}'));

    // Generate document number
    const documentNumber = await generateReference('DOCUMENT');

    // Calculate checksum
    const checksum = createHash('sha256')
      .update(req.file.buffer || req.file.path)
      .digest('hex');

    const document = await prisma.document.create({
      data: {
        documentNumber,
        categoryId: metadata.categoryId,
        title: metadata.title,
        description: metadata.description,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        filePath: req.file.path,
        checksum,
        documentDate: metadata.documentDate,
        expiryDate: metadata.expiryDate,
        customerId: metadata.customerId,
        loanId: metadata.loanId,
        isConfidential: metadata.isConfidential,
        uploadedById: req.user.id,
        status: 'DRAFT',
      },
    });

    await auditEntityChange(req, 'CREATE', 'DOCUMENTS', 'Document', document.id, `Uploaded document ${documentNumber}`);

    res.status(201).json({
      success: true,
      data: {
        id: document.id,
        documentNumber,
      },
      message: 'Document uploaded successfully',
    });
  })
);

/**
 * GET /api/v1/documents
 * List documents with filters
 */
router.get(
  '/',
  requirePermission('DOCUMENTS:READ'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      page = '1',
      limit = '20',
      categoryId,
      customerId,
      loanId,
      status,
      search,
      startDate,
      endDate,
    } = req.query as any;

    const where: any = { isDeleted: false };

    if (categoryId) where.categoryId = categoryId;
    if (customerId) where.customerId = customerId;
    if (loanId) where.loanId = loanId;
    if (status) where.status = status;

    if (startDate && endDate) {
      where.uploadedAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { documentNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Filter confidential documents based on access level
    if (req.user.roleLevel < 70) {
      where.isConfidential = false;
    }

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        orderBy: { uploadedAt: 'desc' },
        select: {
          id: true,
          documentNumber: true,
          title: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          status: true,
          isConfidential: true,
          uploadedAt: true,
          category: { select: { name: true } },
          uploadedBy: { select: { firstName: true, lastName: true } },
          customer: { select: { firstName: true, lastName: true, customerNumber: true } },
        },
      }),
      prisma.document.count({ where }),
    ]);

    res.json({
      success: true,
      data: documents,
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  })
);

/**
 * GET /api/v1/documents/:id
 * Get document details
 */
router.get(
  '/:id',
  requirePermission('DOCUMENTS:READ'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id, isDeleted: false },
      include: {
        category: true,
        uploadedBy: { select: { firstName: true, lastName: true } },
        customer: { select: { firstName: true, lastName: true, customerNumber: true } },
        loan: { select: { loanNumber: true } },
      },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    // Check confidential access
    if (document.isConfidential && req.user.roleLevel < 70) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to confidential document',
      });
    }

    res.json({
      success: true,
      data: document,
    });
  })
);

/**
 * GET /api/v1/documents/:id/download
 * Download document file
 */
router.get(
  '/:id/download',
  requirePermission('DOCUMENTS:READ'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id, isDeleted: false },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    if (document.isConfidential && req.user.roleLevel < 70) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    await auditEntityChange(req, 'READ', 'DOCUMENTS', 'Document', document.id, `Downloaded document ${document.documentNumber}`);

    res.download(document.filePath, document.fileName);
  })
);

/**
 * PUT /api/v1/documents/:id
 * Update document metadata
 */
router.put(
  '/:id',
  requirePermission('DOCUMENTS:UPDATE'),
  validateBody(updateDocumentSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    // Cannot update approved documents
    if (document.status === 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update approved documents',
      });
    }

    const updated = await prisma.document.update({
      where: { id: req.params.id },
      data: req.body,
    });

    await auditEntityChange(req, 'UPDATE', 'DOCUMENTS', 'Document', document.id, `Updated document ${document.documentNumber}`);

    res.json({
      success: true,
      data: { id: updated.id },
      message: 'Document updated',
    });
  })
);

/**
 * POST /api/v1/documents/:id/approve
 * Approve document
 */
router.post(
  '/:id/approve',
  requirePermission('DOCUMENTS:APPROVE'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const document = await prisma.document.update({
      where: { id: req.params.id },
      data: {
        status: 'APPROVED',
        approvedById: req.user.id,
        approvedAt: new Date(),
      },
    });

    await auditEntityChange(req, 'APPROVE', 'DOCUMENTS', 'Document', document.id, `Approved document ${document.documentNumber}`);

    res.json({
      success: true,
      message: 'Document approved',
    });
  })
);

/**
 * DELETE /api/v1/documents/:id
 * Soft delete document
 */
router.delete(
  '/:id',
  requirePermission('DOCUMENTS:DELETE'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { reason } = req.body;

    const document = await prisma.document.update({
      where: { id: req.params.id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedById: req.user.id,
        deletionReason: reason,
      },
    });

    await auditEntityChange(req, 'DELETE', 'DOCUMENTS', 'Document', document.id, `Deleted document: ${reason}`);

    res.json({
      success: true,
      message: 'Document deleted',
    });
  })
);

export default router;
