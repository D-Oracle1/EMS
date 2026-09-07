'use server';

/**
 * Financial Product Administration — Server Actions
 * Hylink Finance Limited EMS
 *
 * Loan products and fixed-deposit rate bands. Both were previously seed-only;
 * this closes that gap so products can be provisioned from the console.
 *
 * Editing rules follow the same principle used for savings products: terms that
 * are baked into issued contracts (rate, tenure band, interest type) are frozen
 * once a product is in use — descriptive fields stay editable.
 */

import Decimal from 'decimal.js';
import { prisma } from '@/lib/prisma';
import { requirePermission, requireAnyPermission } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import type { ActionResult } from '@/types';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ============================================================================
// LOAN PRODUCTS
// ============================================================================

export async function getLoanProducts(includeInactive = false) {
  await requireAnyPermission(['LOANS:READ', 'LOANS:CREATE', 'SYSTEM:CONFIG_MANAGE']);

  const products = await prisma.loanProduct.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
    include: { _count: { select: { loans: true } } },
  });

  return products.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    minAmount: Number(p.minAmount),
    maxAmount: Number(p.maxAmount),
    minTenure: p.minTenure,
    maxTenure: p.maxTenure,
    interestRate: Number(p.interestRate),
    interestType: p.interestType,
    processingFee: Number(p.processingFee),
    insuranceFee: p.insuranceFee ? Number(p.insuranceFee) : null,
    lateFee: p.lateFee ? Number(p.lateFee) : null,
    gracePeriodDays: p.gracePeriodDays,
    penaltyRate: p.penaltyRate ? Number(p.penaltyRate) : null,
    requiresCollateral: p.requiresCollateral,
    requiresGuarantor: p.requiresGuarantor,
    loanReceivableAccountId: p.loanReceivableAccountId,
    interestIncomeAccountId: p.interestIncomeAccountId,
    feeIncomeAccountId: p.feeIncomeAccountId,
    isActive: p.isActive,
    usageCount: p._count.loans,
    createdAt: p.createdAt,
  }));
}

interface LoanProductInput {
  code: string;
  name: string;
  description?: string;
  minAmount: number;
  maxAmount: number;
  minTenure: number;
  maxTenure: number;
  interestRate: number;
  interestType: 'FLAT' | 'REDUCING_BALANCE' | 'COMPOUND';
  processingFee: number;
  insuranceFee?: number;
  lateFee?: number;
  gracePeriodDays?: number;
  penaltyRate?: number;
  requiresCollateral?: boolean;
  requiresGuarantor?: boolean;
  loanReceivableAccountId?: string;
  interestIncomeAccountId?: string;
  feeIncomeAccountId?: string;
}

/** Shared validation for create and update. */
function validateLoanProduct(data: Partial<LoanProductInput>): string | null {
  if (data.name !== undefined && !data.name.trim()) return 'Product name is required';

  if (data.minAmount !== undefined && data.minAmount < 0) return 'Minimum amount cannot be negative';
  if (
    data.minAmount !== undefined &&
    data.maxAmount !== undefined &&
    data.maxAmount < data.minAmount
  ) {
    return 'Maximum amount must be greater than or equal to the minimum amount';
  }

  if (data.minTenure !== undefined && (data.minTenure < 1 || data.minTenure > 360)) {
    return 'Minimum tenure must be between 1 and 360 months';
  }
  if (data.maxTenure !== undefined && (data.maxTenure < 1 || data.maxTenure > 360)) {
    return 'Maximum tenure must be between 1 and 360 months';
  }
  if (
    data.minTenure !== undefined &&
    data.maxTenure !== undefined &&
    data.maxTenure < data.minTenure
  ) {
    return 'Maximum tenure must be greater than or equal to the minimum tenure';
  }

  if (data.interestRate !== undefined && (data.interestRate <= 0 || data.interestRate > 200)) {
    return 'Interest rate must be between 0 and 200 percent';
  }
  if (data.processingFee !== undefined && (data.processingFee < 0 || data.processingFee > 100)) {
    return 'Processing fee must be a percentage between 0 and 100';
  }
  if (
    data.insuranceFee !== undefined &&
    data.insuranceFee !== null &&
    (data.insuranceFee < 0 || data.insuranceFee > 100)
  ) {
    return 'Insurance fee must be a percentage between 0 and 100';
  }
  if (data.penaltyRate !== undefined && data.penaltyRate !== null && data.penaltyRate < 0) {
    return 'Penalty rate cannot be negative';
  }
  if (
    data.gracePeriodDays !== undefined &&
    (data.gracePeriodDays < 0 || data.gracePeriodDays > 365)
  ) {
    return 'Grace period must be between 0 and 365 days';
  }

  return null;
}

/** Confirm any supplied GL account exists and is postable. */
async function validateGLAccounts(ids: Array<string | undefined>): Promise<string | null> {
  const present = ids.filter((id): id is string => Boolean(id));
  if (present.length === 0) return null;

  const accounts = await prisma.chartOfAccounts.findMany({
    where: { id: { in: present } },
    select: { id: true, accountCode: true, isActive: true, isHeader: true },
  });

  if (accounts.length !== new Set(present).size) {
    return 'One or more selected GL accounts could not be found';
  }
  const inactive = accounts.find((a) => !a.isActive);
  if (inactive) return `GL account ${inactive.accountCode} is inactive`;

  const header = accounts.find((a) => a.isHeader);
  if (header) return `GL account ${header.accountCode} is a header account and cannot be posted to`;

  return null;
}

export async function createLoanProduct(
  data: LoanProductInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('SYSTEM:CONFIG_MANAGE');

    const validationError = validateLoanProduct(data);
    if (validationError) return { success: false, error: validationError };

    const code = data.code.trim().toUpperCase().replace(/\s+/g, '_');
    if (!code) return { success: false, error: 'Product code is required' };

    const existing = await prisma.loanProduct.findUnique({ where: { code } });
    if (existing) return { success: false, error: `Product code ${code} is already in use` };

    const glError = await validateGLAccounts([
      data.loanReceivableAccountId,
      data.interestIncomeAccountId,
      data.feeIncomeAccountId,
    ]);
    if (glError) return { success: false, error: glError };

    const product = await prisma.loanProduct.create({
      data: {
        code,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        minAmount: data.minAmount,
        maxAmount: data.maxAmount,
        minTenure: data.minTenure,
        maxTenure: data.maxTenure,
        interestRate: data.interestRate,
        interestType: data.interestType,
        processingFee: data.processingFee,
        insuranceFee: data.insuranceFee ?? null,
        lateFee: data.lateFee ?? null,
        gracePeriodDays: data.gracePeriodDays ?? 0,
        penaltyRate: data.penaltyRate ?? null,
        requiresCollateral: data.requiresCollateral ?? false,
        requiresGuarantor: data.requiresGuarantor ?? false,
        loanReceivableAccountId: data.loanReceivableAccountId || null,
        interestIncomeAccountId: data.interestIncomeAccountId || null,
        feeIncomeAccountId: data.feeIncomeAccountId || null,
        isActive: true,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'SETTINGS',
      entityType: 'LOAN_PRODUCT',
      entityId: product.id,
      description: `Created loan product ${data.name} [${code}] at ${data.interestRate}% ${data.interestType}`,
      newValues: {
        code,
        name: data.name,
        interestRate: data.interestRate,
        interestType: data.interestType,
      },
    });

    return { success: true, message: `Loan product "${data.name}" created`, data: { id: product.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateLoanProduct(
  id: string,
  data: Partial<Omit<LoanProductInput, 'code'>>
): Promise<ActionResult> {
  try {
    const user = await requirePermission('SYSTEM:CONFIG_MANAGE');

    const product = await prisma.loanProduct.findUnique({
      where: { id },
      include: { _count: { select: { loans: true } } },
    });
    if (!product) return { success: false, error: 'Loan product not found' };

    const inUse = product._count.loans > 0;

    // Contract terms are frozen once loans have been booked against the product.
    if (inUse) {
      const frozen: Array<keyof typeof data> = [
        'interestRate',
        'interestType',
        'minTenure',
        'maxTenure',
        'processingFee',
      ];
      const attempted = frozen.filter((field) => data[field] !== undefined);
      if (attempted.length > 0) {
        return {
          success: false,
          error: `${product._count.loans} loan(s) use this product — ${attempted.join(', ')} cannot be changed. Create a new product version instead.`,
        };
      }
    }

    const merged = {
      minAmount: data.minAmount ?? Number(product.minAmount),
      maxAmount: data.maxAmount ?? Number(product.maxAmount),
      minTenure: data.minTenure ?? product.minTenure,
      maxTenure: data.maxTenure ?? product.maxTenure,
      interestRate: data.interestRate ?? Number(product.interestRate),
      processingFee: data.processingFee ?? Number(product.processingFee),
      ...data,
    };
    const validationError = validateLoanProduct(merged);
    if (validationError) return { success: false, error: validationError };

    const glError = await validateGLAccounts([
      data.loanReceivableAccountId,
      data.interestIncomeAccountId,
      data.feeIncomeAccountId,
    ]);
    if (glError) return { success: false, error: glError };

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.description !== undefined) updates.description = data.description.trim() || null;
    if (data.minAmount !== undefined) updates.minAmount = data.minAmount;
    if (data.maxAmount !== undefined) updates.maxAmount = data.maxAmount;
    if (data.minTenure !== undefined) updates.minTenure = data.minTenure;
    if (data.maxTenure !== undefined) updates.maxTenure = data.maxTenure;
    if (data.interestRate !== undefined) updates.interestRate = data.interestRate;
    if (data.interestType !== undefined) updates.interestType = data.interestType;
    if (data.processingFee !== undefined) updates.processingFee = data.processingFee;
    if (data.insuranceFee !== undefined) updates.insuranceFee = data.insuranceFee;
    if (data.lateFee !== undefined) updates.lateFee = data.lateFee;
    if (data.gracePeriodDays !== undefined) updates.gracePeriodDays = data.gracePeriodDays;
    if (data.penaltyRate !== undefined) updates.penaltyRate = data.penaltyRate;
    if (data.requiresCollateral !== undefined) updates.requiresCollateral = data.requiresCollateral;
    if (data.requiresGuarantor !== undefined) updates.requiresGuarantor = data.requiresGuarantor;
    if (data.loanReceivableAccountId !== undefined) {
      updates.loanReceivableAccountId = data.loanReceivableAccountId || null;
    }
    if (data.interestIncomeAccountId !== undefined) {
      updates.interestIncomeAccountId = data.interestIncomeAccountId || null;
    }
    if (data.feeIncomeAccountId !== undefined) {
      updates.feeIncomeAccountId = data.feeIncomeAccountId || null;
    }

    if (Object.keys(updates).length === 0) {
      return { success: false, error: 'No changes supplied' };
    }

    await prisma.loanProduct.update({ where: { id }, data: updates });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'SETTINGS',
      entityType: 'LOAN_PRODUCT',
      entityId: id,
      description: `Updated loan product ${product.name} [${product.code}]`,
      oldValues: {
        name: product.name,
        interestRate: Number(product.interestRate),
        minAmount: Number(product.minAmount),
        maxAmount: Number(product.maxAmount),
      },
      newValues: updates,
      changedFields: Object.keys(updates),
    });

    return { success: true, message: `Loan product "${product.name}" updated` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function setLoanProductActive(
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  try {
    const user = await requirePermission('SYSTEM:CONFIG_MANAGE');

    const product = await prisma.loanProduct.findUnique({ where: { id } });
    if (!product) return { success: false, error: 'Loan product not found' };
    if (product.isActive === isActive) {
      return { success: false, error: `Product is already ${isActive ? 'active' : 'inactive'}` };
    }

    if (!isActive) {
      const openLoans = await prisma.loan.count({
        where: {
          productId: id,
          status: {
            in: [
              'PENDING_VERIFICATION',
              'VERIFICATION_IN_PROGRESS',
              'VERIFIED',
              'PENDING_APPROVAL',
              'APPROVED',
              'PENDING_DISBURSEMENT',
              'DISBURSED',
              'ACTIVE',
              'OVERDUE',
            ],
          },
        },
      });
      if (openLoans > 0) {
        return {
          success: false,
          error: `${openLoans} loan(s) on this product are still open. Deactivating would block their servicing.`,
        };
      }
    }

    await prisma.loanProduct.update({ where: { id }, data: { isActive } });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'SETTINGS',
      entityType: 'LOAN_PRODUCT',
      entityId: id,
      description: `${isActive ? 'Activated' : 'Deactivated'} loan product ${product.name} [${product.code}]`,
    });

    return {
      success: true,
      message: `Loan product "${product.name}" ${isActive ? 'activated' : 'deactivated'}`,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** GL accounts a loan product may be mapped to, for the product form's selects. */
export async function getPostableAccounts() {
  await requireAnyPermission(['SYSTEM:CONFIG_MANAGE', 'ACCOUNTS:COA_MANAGE']);

  const accounts = await prisma.chartOfAccounts.findMany({
    where: { isActive: true },
    orderBy: { accountCode: 'asc' },
    select: {
      id: true,
      accountCode: true,
      accountName: true,
      accountType: true,
      isHeader: true,
    },
  });

  return accounts
    .filter((a) => !a.isHeader)
    .map((a) => ({
      id: a.id,
      code: a.accountCode,
      name: a.accountName,
      type: a.accountType,
      label: `${a.accountCode} — ${a.accountName}`,
    }));
}

// ============================================================================
// FIXED DEPOSIT RATE BANDS
// ============================================================================

export async function getFixedDepositRates(includeInactive = false) {
  await requireAnyPermission(['FIXED_DEPOSITS:READ', 'FIXED_DEPOSITS:CREATE', 'SYSTEM:CONFIG_MANAGE']);

  const rates = await prisma.fixedDepositRate.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ minTenure: 'asc' }, { minAmount: 'asc' }],
  });

  return rates.map((r) => ({
    id: r.id,
    minTenure: r.minTenure,
    maxTenure: r.maxTenure,
    minAmount: Number(r.minAmount),
    maxAmount: r.maxAmount ? Number(r.maxAmount) : null,
    interestRate: Number(r.interestRate),
    isActive: r.isActive,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    createdAt: r.createdAt,
  }));
}

interface RateBandInput {
  minTenure: number;
  maxTenure: number;
  minAmount: number;
  maxAmount?: number | null;
  interestRate: number;
  effectiveFrom?: Date;
  effectiveTo?: Date | null;
}

function validateRateBand(data: RateBandInput): string | null {
  if (data.minTenure < 1) return 'Minimum tenure must be at least 1 day';
  if (data.maxTenure < data.minTenure) {
    return 'Maximum tenure must be greater than or equal to the minimum tenure';
  }
  if (data.maxTenure > 3650) return 'Maximum tenure cannot exceed 3650 days (10 years)';
  if (data.minAmount < 0) return 'Minimum amount cannot be negative';
  if (data.maxAmount != null && data.maxAmount < data.minAmount) {
    return 'Maximum amount must be greater than or equal to the minimum amount';
  }
  if (data.interestRate <= 0 || data.interestRate > 100) {
    return 'Interest rate must be between 0 and 100 percent';
  }
  if (data.effectiveTo && data.effectiveFrom && data.effectiveTo < data.effectiveFrom) {
    return 'The effective-to date must be after the effective-from date';
  }
  return null;
}

/**
 * Reject a band that overlaps an existing active band on both tenure and
 * amount, since rate lookup would then be ambiguous.
 */
async function findOverlappingBand(data: RateBandInput, excludeId?: string) {
  const candidates = await prisma.fixedDepositRate.findMany({
    where: {
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      minTenure: { lte: data.maxTenure },
      maxTenure: { gte: data.minTenure },
    },
  });

  return candidates.find((band) => {
    const bandMax = band.maxAmount ? Number(band.maxAmount) : Number.POSITIVE_INFINITY;
    const newMax = data.maxAmount ?? Number.POSITIVE_INFINITY;
    return Number(band.minAmount) <= newMax && bandMax >= data.minAmount;
  });
}

export async function createFixedDepositRate(
  data: RateBandInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('SYSTEM:CONFIG_MANAGE');

    const validationError = validateRateBand(data);
    if (validationError) return { success: false, error: validationError };

    const overlap = await findOverlappingBand(data);
    if (overlap) {
      return {
        success: false,
        error: `This overlaps an existing band (${overlap.minTenure}-${overlap.maxTenure} days at ${Number(overlap.interestRate)}%). Retire that band first.`,
      };
    }

    const rate = await prisma.fixedDepositRate.create({
      data: {
        minTenure: data.minTenure,
        maxTenure: data.maxTenure,
        minAmount: data.minAmount,
        maxAmount: data.maxAmount ?? null,
        interestRate: data.interestRate,
        effectiveFrom: data.effectiveFrom ?? new Date(),
        effectiveTo: data.effectiveTo ?? null,
        isActive: true,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'SETTINGS',
      entityType: 'FIXED_DEPOSIT_RATE',
      entityId: rate.id,
      description: `Created FD rate band: ${data.minTenure}-${data.maxTenure} days at ${data.interestRate}%`,
      newValues: { ...data, effectiveFrom: undefined, effectiveTo: undefined },
    });

    return { success: true, message: 'Rate band created', data: { id: rate.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateFixedDepositRate(
  id: string,
  data: Partial<RateBandInput>
): Promise<ActionResult> {
  try {
    const user = await requirePermission('SYSTEM:CONFIG_MANAGE');

    const rate = await prisma.fixedDepositRate.findUnique({ where: { id } });
    if (!rate) return { success: false, error: 'Rate band not found' };

    const merged: RateBandInput = {
      minTenure: data.minTenure ?? rate.minTenure,
      maxTenure: data.maxTenure ?? rate.maxTenure,
      minAmount: data.minAmount ?? Number(rate.minAmount),
      maxAmount:
        data.maxAmount !== undefined
          ? data.maxAmount
          : rate.maxAmount
            ? Number(rate.maxAmount)
            : null,
      interestRate: data.interestRate ?? Number(rate.interestRate),
      effectiveFrom: data.effectiveFrom ?? rate.effectiveFrom,
      effectiveTo: data.effectiveTo !== undefined ? data.effectiveTo : rate.effectiveTo,
    };

    const validationError = validateRateBand(merged);
    if (validationError) return { success: false, error: validationError };

    const overlap = await findOverlappingBand(merged, id);
    if (overlap) {
      return {
        success: false,
        error: `This would overlap an existing band (${overlap.minTenure}-${overlap.maxTenure} days at ${Number(overlap.interestRate)}%).`,
      };
    }

    await prisma.fixedDepositRate.update({
      where: { id },
      data: {
        minTenure: merged.minTenure,
        maxTenure: merged.maxTenure,
        minAmount: merged.minAmount,
        maxAmount: merged.maxAmount,
        interestRate: merged.interestRate,
        effectiveFrom: merged.effectiveFrom,
        effectiveTo: merged.effectiveTo,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'SETTINGS',
      entityType: 'FIXED_DEPOSIT_RATE',
      entityId: id,
      description: `Updated FD rate band to ${merged.minTenure}-${merged.maxTenure} days at ${merged.interestRate}%`,
      oldValues: {
        minTenure: rate.minTenure,
        maxTenure: rate.maxTenure,
        interestRate: Number(rate.interestRate),
      },
      newValues: {
        minTenure: merged.minTenure,
        maxTenure: merged.maxTenure,
        interestRate: merged.interestRate,
      },
    });

    return { success: true, message: 'Rate band updated' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Retire a band rather than deleting it — existing deposits were priced from it
 * and the audit trail needs the row to stay resolvable.
 */
export async function retireFixedDepositRate(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('SYSTEM:CONFIG_MANAGE');

    const rate = await prisma.fixedDepositRate.findUnique({ where: { id } });
    if (!rate) return { success: false, error: 'Rate band not found' };
    if (!rate.isActive) return { success: false, error: 'Rate band is already retired' };

    await prisma.fixedDepositRate.update({
      where: { id },
      data: { isActive: false, effectiveTo: new Date() },
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'SETTINGS',
      entityType: 'FIXED_DEPOSIT_RATE',
      entityId: id,
      description: `Retired FD rate band ${rate.minTenure}-${rate.maxTenure} days at ${Number(rate.interestRate)}%`,
    });

    return { success: true, message: 'Rate band retired' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Resolve the applicable rate for a tenure and amount. Where several bands
 * match, the narrowest tenure window wins.
 */
export async function resolveFixedDepositRate(
  tenureDays: number,
  amount: number
): Promise<ActionResult<{ interestRate: number; bandId: string }>> {
  try {
    await requireAnyPermission(['FIXED_DEPOSITS:READ', 'FIXED_DEPOSITS:CREATE']);

    const now = new Date();
    const bands = await prisma.fixedDepositRate.findMany({
      where: {
        isActive: true,
        minTenure: { lte: tenureDays },
        maxTenure: { gte: tenureDays },
        minAmount: { lte: amount },
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
    });

    const applicable = bands.filter(
      (b) => !b.maxAmount || Number(b.maxAmount) >= amount
    );

    if (applicable.length === 0) {
      return {
        success: false,
        error: `No rate band covers ${tenureDays} days at that amount. Configure one in Settings → Deposit Rates.`,
      };
    }

    applicable.sort((a, b) => a.maxTenure - a.minTenure - (b.maxTenure - b.minTenure));
    const best = applicable[0];

    return {
      success: true,
      data: { interestRate: Number(best.interestRate), bandId: best.id },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
