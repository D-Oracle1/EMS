'use server';

/**
 * Learning, Assets, Communication & Goals — Server Actions
 * Hylink Finance Limited EMS
 *
 * The day-to-day surfaces of the HR module: training programmes and
 * enrolments, company asset custody, internal announcements, and the goal
 * ledger that feeds performance reviews.
 */

import { prisma, withTransaction } from '@/lib/prisma';
import { requirePermission, requireAnyPermission, getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import type { ActionResult } from '@/types';

// ============================================================================
// TRAINING PROGRAMMES
// ============================================================================

export async function getTrainingPrograms(filters?: { status?: string; category?: string }) {
  await requireAnyPermission(['HR:TRAINING_MANAGE', 'HR:STAFF_READ']);

  const where: Record<string, unknown> = {};
  if (filters?.status && filters.status !== 'ALL') where.status = filters.status;
  if (filters?.category && filters.category !== 'ALL') where.category = filters.category;

  const programs = await prisma.trainingProgram.findMany({
    where,
    orderBy: { startDate: 'desc' },
    include: {
      facilitator: { select: { firstName: true, lastName: true } },
      _count: { select: { enrollments: true } },
    },
  });

  const completions = await prisma.trainingEnrollment.groupBy({
    by: ['programId'],
    where: { status: 'COMPLETED' },
    _count: { _all: true },
  });
  const completedByProgram = new Map(completions.map((c) => [c.programId, c._count._all]));

  return programs.map((p) => ({
    id: p.id,
    code: p.code,
    title: p.title,
    description: p.description,
    category: p.category,
    provider: p.provider,
    mode: p.mode,
    startDate: p.startDate,
    endDate: p.endDate,
    venue: p.venue,
    capacity: p.capacity,
    costPerSeat: p.costPerSeat ? Number(p.costPerSeat) : null,
    isMandatory: p.isMandatory,
    passMark: p.passMark,
    status: p.status,
    facilitator: p.facilitator ? `${p.facilitator.firstName} ${p.facilitator.lastName}` : null,
    enrolledCount: p._count.enrollments,
    completedCount: completedByProgram.get(p.id) ?? 0,
    seatsLeft: p.capacity ? Math.max(p.capacity - p._count.enrollments, 0) : null,
    totalCost: p.costPerSeat ? Number(p.costPerSeat) * p._count.enrollments : null,
  }));
}

export async function createTrainingProgram(data: {
  title: string;
  description?: string;
  category?: string;
  provider?: string;
  mode?: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
  startDate: string;
  endDate: string;
  venue?: string;
  capacity?: number;
  costPerSeat?: number;
  isMandatory?: boolean;
  passMark?: number;
  facilitatorId?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('HR:TRAINING_MANAGE');

    if (!data.title.trim()) return { success: false, error: 'A programme title is required' };

    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return { success: false, error: 'Enter valid start and end dates' };
    }
    if (endDate < startDate) return { success: false, error: 'The end date must be on or after the start date' };
    if (data.capacity !== undefined && data.capacity < 1) {
      return { success: false, error: 'Capacity must be at least 1' };
    }
    if (data.costPerSeat !== undefined && data.costPerSeat < 0) {
      return { success: false, error: 'Cost per seat cannot be negative' };
    }
    if (data.passMark !== undefined && (data.passMark < 0 || data.passMark > 100)) {
      return { success: false, error: 'The pass mark must be between 0 and 100' };
    }

    const count = await prisma.trainingProgram.count();
    const code = `TRN${String(count + 1).padStart(4, '0')}`;

    const program = await prisma.trainingProgram.create({
      data: {
        code,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        category: data.category ?? 'GENERAL',
        provider: data.provider?.trim() || null,
        mode: data.mode ?? 'IN_PERSON',
        startDate,
        endDate,
        venue: data.venue?.trim() || null,
        capacity: data.capacity ?? null,
        costPerSeat: data.costPerSeat ?? null,
        isMandatory: data.isMandatory ?? false,
        passMark: data.passMark ?? 50,
        facilitatorId: data.facilitatorId || null,
        status: 'PLANNED',
        createdById: user.id,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'TRAINING_PROGRAM',
      entityId: program.id,
      description: `Created training programme "${data.title}" [${code}] running ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`,
    });

    return { success: true, message: `Programme "${data.title}" created`, data: { id: program.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateTrainingProgramStatus(
  id: string,
  status: 'PLANNED' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:TRAINING_MANAGE');

    const program = await prisma.trainingProgram.findUnique({
      where: { id },
      include: { _count: { select: { enrollments: true } } },
    });
    if (!program) return { success: false, error: 'Programme not found' };
    if (program.status === status) return { success: false, error: `Programme is already ${status}` };
    if (program.status === 'COMPLETED') {
      return { success: false, error: 'A completed programme cannot change status' };
    }
    if (status === 'IN_PROGRESS' && program._count.enrollments === 0) {
      return { success: false, error: 'Enrol at least one participant before starting the programme' };
    }

    await prisma.trainingProgram.update({ where: { id }, data: { status } });

    // Attendance closes out with the programme.
    if (status === 'COMPLETED') {
      await prisma.trainingEnrollment.updateMany({
        where: { programId: id, status: { in: ['NOMINATED', 'ENROLLED'] } },
        data: { status: 'NO_SHOW' },
      });
    }
    if (status === 'CANCELLED') {
      await prisma.trainingEnrollment.updateMany({
        where: { programId: id, status: { in: ['NOMINATED', 'ENROLLED'] } },
        data: { status: 'CANCELLED' },
      });
    }

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'TRAINING_PROGRAM',
      entityId: id,
      description: `Moved programme ${program.code} from ${program.status} to ${status}`,
    });

    return { success: true, message: `Programme is now ${status.toLowerCase().replace('_', ' ')}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function enrolStaffInTraining(data: {
  programId: string;
  staffIds: string[];
}): Promise<ActionResult<{ enrolled: number; skipped: number }>> {
  try {
    const user = await requirePermission('HR:TRAINING_MANAGE');

    if (data.staffIds.length === 0) return { success: false, error: 'Select at least one staff member' };

    const program = await prisma.trainingProgram.findUnique({
      where: { id: data.programId },
      include: { _count: { select: { enrollments: true } } },
    });
    if (!program) return { success: false, error: 'Programme not found' };
    if (['COMPLETED', 'CANCELLED'].includes(program.status)) {
      return { success: false, error: `Cannot enrol into a ${program.status.toLowerCase()} programme` };
    }

    const uniqueIds = Array.from(new Set(data.staffIds));

    if (program.capacity) {
      const seatsLeft = program.capacity - program._count.enrollments;
      if (uniqueIds.length > seatsLeft) {
        return {
          success: false,
          error: `Only ${seatsLeft} seat(s) remain on this programme — you selected ${uniqueIds.length}`,
        };
      }
    }

    const existing = await prisma.trainingEnrollment.findMany({
      where: { programId: data.programId, staffId: { in: uniqueIds } },
      select: { staffId: true },
    });
    const alreadyEnrolled = new Set(existing.map((e) => e.staffId));
    const toEnrol = uniqueIds.filter((id) => !alreadyEnrolled.has(id));

    if (toEnrol.length === 0) {
      return { success: false, error: 'All selected staff are already enrolled' };
    }

    await prisma.trainingEnrollment.createMany({
      data: toEnrol.map((staffId) => ({ programId: data.programId, staffId, status: 'NOMINATED' })),
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'TRAINING_ENROLLMENT',
      description: `Enrolled ${toEnrol.length} staff into ${program.title} [${program.code}]`,
    });

    for (const staffId of toEnrol) {
      await createNotification({
        userId: staffId,
        type: 'INFO',
        title: `You have been nominated for ${program.title}`,
        message: `${program.title} runs from ${program.startDate.toDateString()} to ${program.endDate.toDateString()}${program.venue ? ` at ${program.venue}` : ''}.`,
        entityType: 'TRAINING_PROGRAM',
        entityId: program.id,
        actionUrl: '/hr/training',
      });
    }

    return {
      success: true,
      message: `${toEnrol.length} staff enrolled${alreadyEnrolled.size > 0 ? `, ${alreadyEnrolled.size} already enrolled` : ''}`,
      data: { enrolled: toEnrol.length, skipped: alreadyEnrolled.size },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getTrainingEnrollments(programId: string) {
  await requireAnyPermission(['HR:TRAINING_MANAGE', 'HR:STAFF_READ']);

  const enrollments = await prisma.trainingEnrollment.findMany({
    where: { programId },
    orderBy: { createdAt: 'asc' },
    include: {
      staff: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          department: { select: { name: true } },
        },
      },
    },
  });

  return enrollments.map((e) => ({
    id: e.id,
    staffId: e.staffId,
    staffName: `${e.staff.firstName} ${e.staff.lastName}`,
    employeeId: e.staff.employeeId,
    jobTitle: e.staff.jobTitle,
    department: e.staff.department.name,
    status: e.status,
    attendedAt: e.attendedAt,
    completedAt: e.completedAt,
    score: e.score,
    passed: e.passed,
    feedback: e.feedback,
    certificateUrl: e.certificateUrl,
  }));
}

export async function recordTrainingResult(
  enrollmentId: string,
  data: {
    status: 'ATTENDED' | 'COMPLETED' | 'FAILED' | 'NO_SHOW' | 'CANCELLED';
    score?: number;
    feedback?: string;
    certificateUrl?: string;
  }
): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:TRAINING_MANAGE');

    const enrollment = await prisma.trainingEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        program: { select: { title: true, passMark: true, status: true } },
        staff: { select: { firstName: true, lastName: true } },
      },
    });
    if (!enrollment) return { success: false, error: 'Enrolment not found' };
    if (data.score !== undefined && (data.score < 0 || data.score > 100)) {
      return { success: false, error: 'Score must be between 0 and 100' };
    }
    if (data.status === 'COMPLETED' && data.score === undefined) {
      return { success: false, error: 'Record a score when marking a programme complete' };
    }

    const passMark = enrollment.program.passMark ?? 50;
    const passed = data.score !== undefined ? data.score >= passMark : null;

    await prisma.trainingEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: data.status === 'COMPLETED' && passed === false ? 'FAILED' : data.status,
        score: data.score ?? enrollment.score,
        passed,
        feedback: data.feedback?.trim() ?? enrollment.feedback,
        certificateUrl: data.certificateUrl?.trim() ?? enrollment.certificateUrl,
        attendedAt:
          ['ATTENDED', 'COMPLETED', 'FAILED'].includes(data.status) && !enrollment.attendedAt
            ? new Date()
            : enrollment.attendedAt,
        completedAt: data.status === 'COMPLETED' ? new Date() : enrollment.completedAt,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'TRAINING_ENROLLMENT',
      entityId: enrollmentId,
      description: `Recorded ${data.status} for ${enrollment.staff.firstName} ${enrollment.staff.lastName} on ${enrollment.program.title}${data.score !== undefined ? ` (score ${data.score})` : ''}`,
    });

    return {
      success: true,
      message:
        passed === false
          ? `Recorded — score is below the ${passMark} pass mark`
          : 'Training result recorded',
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** The signed-in staff member's own training record. */
export async function getMyTraining() {
  const { user } = await getSession();

  const enrollments = await prisma.trainingEnrollment.findMany({
    where: { staffId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      program: {
        select: {
          code: true,
          title: true,
          category: true,
          startDate: true,
          endDate: true,
          venue: true,
          mode: true,
          status: true,
        },
      },
    },
  });

  return enrollments.map((e) => ({
    id: e.id,
    program: e.program,
    status: e.status,
    score: e.score,
    passed: e.passed,
    certificateUrl: e.certificateUrl,
    completedAt: e.completedAt,
  }));
}

// ============================================================================
// COMPANY ASSETS
// ============================================================================

export async function getCompanyAssets(filters?: { status?: string; category?: string; search?: string }) {
  await requireAnyPermission(['HR:ASSET_MANAGE', 'HR:STAFF_READ']);

  const where: Record<string, unknown> = {};
  if (filters?.status && filters.status !== 'ALL') where.status = filters.status;
  if (filters?.category && filters.category !== 'ALL') where.category = filters.category;
  if (filters?.search) {
    where.OR = [
      { assetTag: { contains: filters.search, mode: 'insensitive' } },
      { name: { contains: filters.search, mode: 'insensitive' } },
      { serialNumber: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const assets = await prisma.companyAsset.findMany({
    where,
    orderBy: { assetTag: 'asc' },
    include: {
      branch: { select: { name: true } },
      assignments: {
        where: { returnedAt: null },
        take: 1,
        include: { staff: { select: { id: true, employeeId: true, firstName: true, lastName: true } } },
      },
    },
  });

  return assets.map((a) => {
    const current = a.assignments[0];
    return {
      id: a.id,
      assetTag: a.assetTag,
      name: a.name,
      category: a.category,
      make: a.make,
      model: a.model,
      serialNumber: a.serialNumber,
      purchaseDate: a.purchaseDate,
      purchaseCost: a.purchaseCost ? Number(a.purchaseCost) : null,
      warrantyUntil: a.warrantyUntil,
      condition: a.condition,
      status: a.status,
      branchName: a.branch?.name ?? null,
      notes: a.notes,
      assignedTo: current ? `${current.staff.firstName} ${current.staff.lastName}` : null,
      assignedToId: current?.staff.id ?? null,
      assignedAt: current?.assignedAt ?? null,
      dueReturnAt: current?.dueReturnAt ?? null,
      isOverdue: current?.dueReturnAt ? current.dueReturnAt < new Date() : false,
    };
  });
}

export async function createCompanyAsset(data: {
  assetTag: string;
  name: string;
  category?: string;
  make?: string;
  model?: string;
  serialNumber?: string;
  purchaseDate?: string;
  purchaseCost?: number;
  warrantyUntil?: string;
  condition?: string;
  branchId?: string;
  notes?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('HR:ASSET_MANAGE');

    const assetTag = data.assetTag.trim().toUpperCase();
    if (!assetTag || !data.name.trim()) {
      return { success: false, error: 'Asset tag and name are required' };
    }
    if (data.purchaseCost !== undefined && data.purchaseCost < 0) {
      return { success: false, error: 'Purchase cost cannot be negative' };
    }

    const existing = await prisma.companyAsset.findUnique({ where: { assetTag } });
    if (existing) return { success: false, error: `Asset tag ${assetTag} is already in use` };

    if (data.serialNumber?.trim()) {
      const dupSerial = await prisma.companyAsset.findFirst({
        where: { serialNumber: data.serialNumber.trim() },
      });
      if (dupSerial) {
        return { success: false, error: `Serial number is already recorded on asset ${dupSerial.assetTag}` };
      }
    }

    const asset = await prisma.companyAsset.create({
      data: {
        assetTag,
        name: data.name.trim(),
        category: data.category ?? 'IT',
        make: data.make?.trim() || null,
        model: data.model?.trim() || null,
        serialNumber: data.serialNumber?.trim() || null,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
        purchaseCost: data.purchaseCost ?? null,
        warrantyUntil: data.warrantyUntil ? new Date(data.warrantyUntil) : null,
        condition: data.condition ?? 'GOOD',
        branchId: data.branchId || null,
        notes: data.notes?.trim() || null,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'COMPANY_ASSET',
      entityId: asset.id,
      description: `Registered asset ${assetTag} — ${data.name}`,
    });

    return { success: true, message: `Asset ${assetTag} registered`, data: { id: asset.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function assignAsset(data: {
  assetId: string;
  staffId: string;
  dueReturnAt?: string;
  notes?: string;
}): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:ASSET_MANAGE');

    const asset = await prisma.companyAsset.findUnique({
      where: { id: data.assetId },
      include: { assignments: { where: { returnedAt: null }, take: 1 } },
    });
    if (!asset) return { success: false, error: 'Asset not found' };
    if (asset.assignments.length > 0) {
      return { success: false, error: 'This asset is already assigned. Record its return first.' };
    }
    if (asset.status !== 'AVAILABLE') {
      return { success: false, error: `Asset is ${asset.status.toLowerCase()} and cannot be assigned` };
    }

    const staff = await prisma.staff.findUnique({
      where: { id: data.staffId },
      select: { firstName: true, lastName: true, status: true, isDeleted: true },
    });
    if (!staff || staff.isDeleted) return { success: false, error: 'Staff not found' };
    if (staff.status === 'TERMINATED') {
      return { success: false, error: 'Assets cannot be assigned to a terminated staff member' };
    }

    let dueReturnAt: Date | null = null;
    if (data.dueReturnAt) {
      dueReturnAt = new Date(data.dueReturnAt);
      if (Number.isNaN(dueReturnAt.getTime())) return { success: false, error: 'Enter a valid return date' };
    }

    await withTransaction(async (tx) => {
      await tx.assetAssignment.create({
        data: {
          assetId: data.assetId,
          staffId: data.staffId,
          assignedById: user.id,
          dueReturnAt,
          notes: data.notes?.trim() || null,
        },
      });
      await tx.companyAsset.update({ where: { id: data.assetId }, data: { status: 'ASSIGNED' } });
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'ASSET_ASSIGNMENT',
      entityId: data.assetId,
      description: `Assigned ${asset.assetTag} (${asset.name}) to ${staff.firstName} ${staff.lastName}`,
    });

    await createNotification({
      userId: data.staffId,
      type: 'INFO',
      title: 'Company asset assigned to you',
      message: `${asset.name} (${asset.assetTag}) has been issued to you${dueReturnAt ? `, due back ${dueReturnAt.toDateString()}` : ''}.`,
      entityType: 'COMPANY_ASSET',
      entityId: asset.id,
      actionUrl: '/hr/my-profile',
      email: false,
    });

    return { success: true, message: `${asset.assetTag} assigned to ${staff.firstName} ${staff.lastName}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function returnAsset(data: {
  assetId: string;
  returnCondition: string;
  returnNotes?: string;
  newStatus?: 'AVAILABLE' | 'MAINTENANCE' | 'RETIRED' | 'DAMAGED' | 'LOST';
}): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:ASSET_MANAGE');

    const asset = await prisma.companyAsset.findUnique({
      where: { id: data.assetId },
      include: {
        assignments: {
          where: { returnedAt: null },
          take: 1,
          include: { staff: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    if (!asset) return { success: false, error: 'Asset not found' };

    const assignment = asset.assignments[0];
    if (!assignment) return { success: false, error: 'This asset is not currently assigned' };
    if (!data.returnCondition.trim()) return { success: false, error: 'Record the condition on return' };

    await withTransaction(async (tx) => {
      await tx.assetAssignment.update({
        where: { id: assignment.id },
        data: {
          returnedAt: new Date(),
          returnCondition: data.returnCondition.trim(),
          returnNotes: data.returnNotes?.trim() || null,
        },
      });
      await tx.companyAsset.update({
        where: { id: data.assetId },
        data: {
          status: data.newStatus ?? 'AVAILABLE',
          condition: data.returnCondition.trim(),
        },
      });
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'ASSET_ASSIGNMENT',
      entityId: assignment.id,
      description: `${asset.assetTag} returned by ${assignment.staff.firstName} ${assignment.staff.lastName} in ${data.returnCondition} condition`,
    });

    return { success: true, message: `${asset.assetTag} returned` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Assets currently held by one staff member — shown on their profile. */
export async function getStaffAssets(staffId: string) {
  const { user } = await getSession();
  if (staffId !== user.id) {
    await requireAnyPermission(['HR:ASSET_MANAGE', 'HR:STAFF_READ']);
  }

  const assignments = await prisma.assetAssignment.findMany({
    where: { staffId, returnedAt: null },
    orderBy: { assignedAt: 'desc' },
    include: { asset: { select: { assetTag: true, name: true, category: true, serialNumber: true } } },
  });

  return assignments.map((a) => ({
    id: a.id,
    assetTag: a.asset.assetTag,
    name: a.asset.name,
    category: a.asset.category,
    serialNumber: a.asset.serialNumber,
    assignedAt: a.assignedAt,
    dueReturnAt: a.dueReturnAt,
    acknowledgedAt: a.acknowledgedAt,
    isOverdue: a.dueReturnAt ? a.dueReturnAt < new Date() : false,
  }));
}

export async function acknowledgeAssetReceipt(assignmentId: string): Promise<ActionResult> {
  try {
    const { user } = await getSession();

    const assignment = await prisma.assetAssignment.findUnique({
      where: { id: assignmentId },
      include: { asset: { select: { assetTag: true, name: true } } },
    });
    if (!assignment) return { success: false, error: 'Assignment not found' };
    if (assignment.staffId !== user.id) {
      return { success: false, error: 'You can only acknowledge assets issued to you' };
    }
    if (assignment.acknowledgedAt) return { success: false, error: 'You have already acknowledged this asset' };
    if (assignment.returnedAt) return { success: false, error: 'This asset has already been returned' };

    await prisma.assetAssignment.update({
      where: { id: assignmentId },
      data: { acknowledgedAt: new Date() },
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'ASSET_ASSIGNMENT',
      entityId: assignmentId,
      description: `Acknowledged receipt of ${assignment.asset.assetTag} (${assignment.asset.name})`,
    });

    return { success: true, message: 'Receipt acknowledged' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// ANNOUNCEMENTS
// ============================================================================

/** Announcements visible to the signed-in user, respecting the audience filter. */
export async function getMyAnnouncements() {
  const { user } = await getSession();

  const staff = await prisma.staff.findUnique({
    where: { id: user.id },
    select: { departmentId: true, branchId: true, roleId: true },
  });
  if (!staff) return [];

  const now = new Date();
  const announcements = await prisma.announcement.findMany({
    where: {
      isPublished: true,
      publishedAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      AND: [
        {
          OR: [
            { audienceType: 'ALL' },
            { audienceType: 'DEPARTMENT', audienceId: staff.departmentId },
            { audienceType: 'BRANCH', audienceId: staff.branchId },
            { audienceType: 'ROLE', audienceId: staff.roleId },
          ],
        },
      ],
    },
    orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
    take: 50,
    include: {
      author: { select: { firstName: true, lastName: true } },
      acknowledgements: { where: { staffId: user.id }, select: { acknowledgedAt: true } },
    },
  });

  return announcements.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    category: a.category,
    priority: a.priority,
    pinned: a.pinned,
    requiresAck: a.requiresAck,
    attachmentUrl: a.attachmentUrl,
    publishedAt: a.publishedAt,
    expiresAt: a.expiresAt,
    author: `${a.author.firstName} ${a.author.lastName}`,
    acknowledgedAt: a.acknowledgements[0]?.acknowledgedAt ?? null,
    needsAcknowledgement: a.requiresAck && a.acknowledgements.length === 0,
  }));
}

export async function getAnnouncements(includeUnpublished = false) {
  await requireAnyPermission(['HR:ANNOUNCE', 'HR:STAFF_READ']);

  const announcements = await prisma.announcement.findMany({
    where: includeUnpublished ? {} : { isPublished: true },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    include: {
      author: { select: { firstName: true, lastName: true } },
      _count: { select: { acknowledgements: true } },
    },
  });

  return announcements.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    category: a.category,
    priority: a.priority,
    audienceType: a.audienceType,
    audienceId: a.audienceId,
    isPublished: a.isPublished,
    publishedAt: a.publishedAt,
    expiresAt: a.expiresAt,
    requiresAck: a.requiresAck,
    pinned: a.pinned,
    author: `${a.author.firstName} ${a.author.lastName}`,
    acknowledgementCount: a._count.acknowledgements,
    createdAt: a.createdAt,
  }));
}

export async function createAnnouncement(data: {
  title: string;
  body: string;
  category?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  audienceType?: 'ALL' | 'DEPARTMENT' | 'BRANCH' | 'ROLE';
  audienceId?: string;
  expiresAt?: string;
  requiresAck?: boolean;
  pinned?: boolean;
  attachmentUrl?: string;
  publishNow?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('HR:ANNOUNCE');

    if (!data.title.trim()) return { success: false, error: 'A title is required' };
    if (!data.body.trim()) return { success: false, error: 'The announcement body cannot be empty' };

    const audienceType = data.audienceType ?? 'ALL';
    if (audienceType !== 'ALL' && !data.audienceId) {
      return { success: false, error: `Select a ${audienceType.toLowerCase()} for the audience` };
    }

    let expiresAt: Date | null = null;
    if (data.expiresAt) {
      expiresAt = new Date(data.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) return { success: false, error: 'Enter a valid expiry date' };
      if (expiresAt < new Date()) return { success: false, error: 'The expiry date is already in the past' };
    }

    const announcement = await prisma.announcement.create({
      data: {
        title: data.title.trim(),
        body: data.body.trim(),
        category: data.category ?? 'GENERAL',
        priority: data.priority ?? 'NORMAL',
        audienceType,
        audienceId: audienceType === 'ALL' ? null : data.audienceId,
        expiresAt,
        requiresAck: data.requiresAck ?? false,
        pinned: data.pinned ?? false,
        attachmentUrl: data.attachmentUrl?.trim() || null,
        isPublished: data.publishNow ?? false,
        publishedAt: data.publishNow ? new Date() : null,
        authorId: user.id,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'ANNOUNCEMENT',
      entityId: announcement.id,
      description: `${data.publishNow ? 'Published' : 'Drafted'} announcement "${data.title}" to ${audienceType}`,
    });

    if (data.publishNow) {
      await notifyAnnouncementAudience(announcement.id);
    }

    return {
      success: true,
      message: data.publishNow ? 'Announcement published' : 'Announcement saved as a draft',
      data: { id: announcement.id },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function publishAnnouncement(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:ANNOUNCE');

    const announcement = await prisma.announcement.findUnique({ where: { id } });
    if (!announcement) return { success: false, error: 'Announcement not found' };
    if (announcement.isPublished) return { success: false, error: 'This announcement is already published' };

    await prisma.announcement.update({
      where: { id },
      data: { isPublished: true, publishedAt: new Date() },
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'ANNOUNCEMENT',
      entityId: id,
      description: `Published announcement "${announcement.title}"`,
    });

    await notifyAnnouncementAudience(id);

    return { success: true, message: 'Announcement published' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Push an in-app notification to everyone in the announcement's audience. */
async function notifyAnnouncementAudience(announcementId: string): Promise<void> {
  try {
    const announcement = await prisma.announcement.findUnique({ where: { id: announcementId } });
    if (!announcement) return;

    const where: Record<string, unknown> = { status: 'ACTIVE', isDeleted: false };
    if (announcement.audienceType === 'DEPARTMENT') where.departmentId = announcement.audienceId;
    if (announcement.audienceType === 'BRANCH') where.branchId = announcement.audienceId;
    if (announcement.audienceType === 'ROLE') where.roleId = announcement.audienceId;

    const recipients = await prisma.staff.findMany({ where, select: { id: true } });

    // Only urgent notices go out by email; the rest stay in-app.
    const sendEmail = announcement.priority === 'URGENT';

    for (const recipient of recipients) {
      await createNotification({
        userId: recipient.id,
        type: announcement.priority === 'URGENT' ? 'WARNING' : 'INFO',
        title: announcement.title,
        message: announcement.body.slice(0, 240),
        entityType: 'ANNOUNCEMENT',
        entityId: announcementId,
        actionUrl: '/hr/announcements',
        email: sendEmail,
      });
    }
  } catch (error) {
    console.error('Failed to notify announcement audience:', error);
  }
}

export async function acknowledgeAnnouncement(announcementId: string): Promise<ActionResult> {
  try {
    const { user } = await getSession();

    const announcement = await prisma.announcement.findUnique({ where: { id: announcementId } });
    if (!announcement) return { success: false, error: 'Announcement not found' };
    if (!announcement.isPublished) return { success: false, error: 'This announcement is not published' };

    const existing = await prisma.announcementAck.findUnique({
      where: { announcementId_staffId: { announcementId, staffId: user.id } },
    });
    if (existing) return { success: false, error: 'You have already acknowledged this announcement' };

    await prisma.announcementAck.create({ data: { announcementId, staffId: user.id } });

    return { success: true, message: 'Acknowledged' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Who has and has not acknowledged — the compliance view. */
export async function getAnnouncementAcknowledgements(announcementId: string) {
  await requirePermission('HR:ANNOUNCE');

  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
    include: {
      acknowledgements: {
        include: { staff: { select: { employeeId: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!announcement) throw new Error('Announcement not found');

  const where: Record<string, unknown> = { status: 'ACTIVE', isDeleted: false };
  if (announcement.audienceType === 'DEPARTMENT') where.departmentId = announcement.audienceId;
  if (announcement.audienceType === 'BRANCH') where.branchId = announcement.audienceId;
  if (announcement.audienceType === 'ROLE') where.roleId = announcement.audienceId;

  const audience = await prisma.staff.findMany({
    where,
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      department: { select: { name: true } },
    },
    orderBy: { employeeId: 'asc' },
  });

  const ackByStaff = new Map(announcement.acknowledgements.map((a) => [a.staffId, a.acknowledgedAt]));

  return {
    title: announcement.title,
    requiresAck: announcement.requiresAck,
    audienceSize: audience.length,
    acknowledgedCount: announcement.acknowledgements.length,
    rows: audience.map((s) => ({
      staffId: s.id,
      employeeId: s.employeeId,
      name: `${s.firstName} ${s.lastName}`,
      department: s.department.name,
      acknowledgedAt: ackByStaff.get(s.id) ?? null,
    })),
  };
}

// ============================================================================
// GOALS
// ============================================================================

export async function getStaffGoals(filters?: { staffId?: string; status?: string; reviewPeriod?: string }) {
  const { user } = await getSession();

  const where: Record<string, unknown> = {};
  if (filters?.staffId) {
    where.staffId = filters.staffId;
    if (filters.staffId !== user.id) {
      await requireAnyPermission(['HR:PERFORMANCE_MANAGE', 'HR:STAFF_READ']);
    }
  } else {
    await requireAnyPermission(['HR:PERFORMANCE_MANAGE', 'HR:STAFF_READ']);
  }
  if (filters?.status && filters.status !== 'ALL') where.status = filters.status;
  if (filters?.reviewPeriod) where.reviewPeriod = filters.reviewPeriod;

  const goals = await prisma.staffGoal.findMany({
    where,
    orderBy: [{ dueDate: 'asc' }],
    take: 200,
    include: {
      staff: { select: { employeeId: true, firstName: true, lastName: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });

  return goals.map((g) => ({
    id: g.id,
    staffId: g.staffId,
    staffName: `${g.staff.firstName} ${g.staff.lastName}`,
    employeeId: g.staff.employeeId,
    title: g.title,
    description: g.description,
    category: g.category,
    targetValue: g.targetValue ? Number(g.targetValue) : null,
    actualValue: g.actualValue ? Number(g.actualValue) : null,
    unit: g.unit,
    weight: g.weight,
    startDate: g.startDate,
    dueDate: g.dueDate,
    status: g.status,
    progress: g.progress,
    ratedScore: g.ratedScore,
    reviewPeriod: g.reviewPeriod,
    createdBy: `${g.createdBy.firstName} ${g.createdBy.lastName}`,
    isOverdue: g.status === 'ACTIVE' && g.dueDate < new Date(),
  }));
}

export async function createStaffGoal(data: {
  staffId: string;
  title: string;
  description?: string;
  category?: string;
  targetValue?: number;
  unit?: string;
  weight?: number;
  startDate: string;
  dueDate: string;
  reviewPeriod?: string;
  activateNow?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('HR:PERFORMANCE_MANAGE');

    if (!data.title.trim()) return { success: false, error: 'A goal title is required' };

    const startDate = new Date(data.startDate);
    const dueDate = new Date(data.dueDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(dueDate.getTime())) {
      return { success: false, error: 'Enter valid start and due dates' };
    }
    if (dueDate < startDate) return { success: false, error: 'The due date must be on or after the start date' };
    if (data.weight !== undefined && (data.weight < 1 || data.weight > 100)) {
      return { success: false, error: 'Weight must be between 1 and 100' };
    }

    const staff = await prisma.staff.findUnique({
      where: { id: data.staffId },
      select: { firstName: true, lastName: true, isDeleted: true },
    });
    if (!staff || staff.isDeleted) return { success: false, error: 'Staff not found' };

    // Total weight across active goals in a review period should not exceed 100.
    if (data.reviewPeriod && data.weight) {
      const existing = await prisma.staffGoal.aggregate({
        where: {
          staffId: data.staffId,
          reviewPeriod: data.reviewPeriod,
          status: { in: ['DRAFT', 'ACTIVE'] },
        },
        _sum: { weight: true },
      });
      const total = (existing._sum.weight ?? 0) + data.weight;
      if (total > 100) {
        return {
          success: false,
          error: `Goal weights for ${data.reviewPeriod} would total ${total}%. Keep the total at or below 100%.`,
        };
      }
    }

    const goal = await prisma.staffGoal.create({
      data: {
        staffId: data.staffId,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        category: data.category ?? 'PERFORMANCE',
        targetValue: data.targetValue ?? null,
        unit: data.unit?.trim() || null,
        weight: data.weight ?? 10,
        startDate,
        dueDate,
        reviewPeriod: data.reviewPeriod?.trim() || null,
        status: data.activateNow ? 'ACTIVE' : 'DRAFT',
        createdById: user.id,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'STAFF_GOAL',
      entityId: goal.id,
      description: `Set goal "${data.title}" for ${staff.firstName} ${staff.lastName}, due ${dueDate.toISOString().slice(0, 10)}`,
    });

    if (data.activateNow) {
      await createNotification({
        userId: data.staffId,
        type: 'TASK_ASSIGNED',
        title: 'A new goal has been set for you',
        message: `"${data.title}" is due by ${dueDate.toDateString()}.`,
        entityType: 'STAFF_GOAL',
        entityId: goal.id,
        actionUrl: '/hr/my-profile',
        email: false,
      });
    }

    return { success: true, message: 'Goal created', data: { id: goal.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateGoalProgress(
  id: string,
  data: { progress?: number; actualValue?: number; status?: 'ACTIVE' | 'ACHIEVED' | 'MISSED' | 'CANCELLED'; ratedScore?: number }
): Promise<ActionResult> {
  try {
    const { user } = await getSession();

    const goal = await prisma.staffGoal.findUnique({
      where: { id },
      include: { staff: { select: { firstName: true, lastName: true } } },
    });
    if (!goal) return { success: false, error: 'Goal not found' };

    // Staff may report progress on their own goals; scoring is a manager action.
    const isOwner = goal.staffId === user.id;
    if (!isOwner) {
      await requirePermission('HR:PERFORMANCE_MANAGE');
    } else if (data.ratedScore !== undefined || data.status === 'ACHIEVED' || data.status === 'MISSED') {
      return { success: false, error: 'Only a manager can close out or score a goal' };
    }

    if (goal.status === 'CANCELLED') return { success: false, error: 'This goal was cancelled' };
    if (data.progress !== undefined && (data.progress < 0 || data.progress > 100)) {
      return { success: false, error: 'Progress must be between 0 and 100' };
    }
    if (data.ratedScore !== undefined && (data.ratedScore < 1 || data.ratedScore > 5)) {
      return { success: false, error: 'The rating must be between 1 and 5' };
    }

    const updates: Record<string, unknown> = {};
    if (data.progress !== undefined) updates.progress = data.progress;
    if (data.actualValue !== undefined) updates.actualValue = data.actualValue;
    if (data.status !== undefined) updates.status = data.status;
    if (data.ratedScore !== undefined) updates.ratedScore = data.ratedScore;

    // Reaching 100% closes the goal out unless a manager says otherwise.
    if (data.progress === 100 && data.status === undefined && goal.status === 'ACTIVE') {
      updates.status = 'ACHIEVED';
    }

    await prisma.staffGoal.update({ where: { id }, data: updates });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'STAFF_GOAL',
      entityId: id,
      description: `Updated goal "${goal.title}" for ${goal.staff.firstName} ${goal.staff.lastName}`,
      changedFields: Object.keys(updates),
    });

    return { success: true, message: 'Goal updated' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
