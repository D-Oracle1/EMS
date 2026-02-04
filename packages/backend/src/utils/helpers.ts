/**
 * Hylink EMS - Utility Helper Functions
 */

import { randomBytes, createHash } from 'crypto';
import Decimal from 'decimal.js';
import { addMonths, addDays, format, differenceInDays, startOfMonth, endOfMonth } from 'date-fns';
import { prisma } from '../lib/prisma.js';

// Configure Decimal.js for financial calculations
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Generate unique reference numbers with prefix
 */
export async function generateReference(type: string): Promise<string> {
  const prefixes: Record<string, string> = {
    LOAN: 'LN',
    SAVINGS_ACCOUNT: 'SA',
    SAVINGS_TXN: 'ST',
    FIXED_DEPOSIT: 'FD',
    CUSTOMER: 'CU',
    EMPLOYEE: 'EMP',
    JOURNAL: 'JE',
    RECEIPT: 'RC',
    DOCUMENT: 'DOC',
    VERIFICATION: 'VF',
  };

  const prefix = prefixes[type] || 'REF';
  const dateStr = format(new Date(), 'yyyyMMdd');

  // Get or update sequence
  const sequence = await prisma.sequence.upsert({
    where: { code: type },
    update: { currentValue: { increment: 1 } },
    create: {
      code: type,
      prefix: prefix,
      currentValue: 1,
      padLength: 6,
    },
  });

  const paddedNumber = String(sequence.currentValue).padStart(sequence.padLength, '0');
  return `${prefix}${dateStr}${paddedNumber}`;
}

/**
 * Generate secure random token
 */
export function generateToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generate file checksum for integrity verification
 */
export function generateChecksum(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Calculate loan repayment schedule (Reducing Balance)
 */
export function calculateReducingBalanceSchedule(
  principal: number,
  annualRate: number,
  tenureMonths: number,
  startDate: Date
): {
  totalInterest: number;
  totalRepayment: number;
  monthlyInstalment: number;
  schedule: Array<{
    installmentNumber: number;
    dueDate: Date;
    principalDue: number;
    interestDue: number;
    totalDue: number;
    outstandingBalance: number;
  }>;
} {
  const monthlyRate = new Decimal(annualRate).div(100).div(12);
  const principalDecimal = new Decimal(principal);

  // EMI Formula: P * r * (1+r)^n / ((1+r)^n - 1)
  const onePlusR = monthlyRate.plus(1);
  const onePlusRPowerN = onePlusR.pow(tenureMonths);
  const emi = principalDecimal
    .times(monthlyRate)
    .times(onePlusRPowerN)
    .div(onePlusRPowerN.minus(1));

  const schedule = [];
  let balance = principalDecimal;
  let totalInterest = new Decimal(0);

  for (let i = 1; i <= tenureMonths; i++) {
    const interestDue = balance.times(monthlyRate);
    const principalDue = emi.minus(interestDue);
    balance = balance.minus(principalDue);

    // Handle final payment rounding
    if (i === tenureMonths && !balance.isZero()) {
      balance = new Decimal(0);
    }

    totalInterest = totalInterest.plus(interestDue);

    schedule.push({
      installmentNumber: i,
      dueDate: addMonths(startDate, i),
      principalDue: principalDue.toDecimalPlaces(2).toNumber(),
      interestDue: interestDue.toDecimalPlaces(2).toNumber(),
      totalDue: emi.toDecimalPlaces(2).toNumber(),
      outstandingBalance: balance.toDecimalPlaces(2).toNumber(),
    });
  }

  return {
    totalInterest: totalInterest.toDecimalPlaces(2).toNumber(),
    totalRepayment: principalDecimal.plus(totalInterest).toDecimalPlaces(2).toNumber(),
    monthlyInstalment: emi.toDecimalPlaces(2).toNumber(),
    schedule,
  };
}

/**
 * Calculate loan repayment schedule (Flat Rate)
 */
export function calculateFlatRateSchedule(
  principal: number,
  annualRate: number,
  tenureMonths: number,
  startDate: Date
): {
  totalInterest: number;
  totalRepayment: number;
  monthlyInstalment: number;
  schedule: Array<{
    installmentNumber: number;
    dueDate: Date;
    principalDue: number;
    interestDue: number;
    totalDue: number;
    outstandingBalance: number;
  }>;
} {
  const principalDecimal = new Decimal(principal);
  const rate = new Decimal(annualRate).div(100);

  // Total interest = Principal * Rate * (Tenure / 12)
  const totalInterest = principalDecimal.times(rate).times(new Decimal(tenureMonths).div(12));
  const totalRepayment = principalDecimal.plus(totalInterest);
  const monthlyInstalment = totalRepayment.div(tenureMonths);

  const monthlyPrincipal = principalDecimal.div(tenureMonths);
  const monthlyInterest = totalInterest.div(tenureMonths);

  const schedule = [];
  let balance = principalDecimal;

  for (let i = 1; i <= tenureMonths; i++) {
    balance = balance.minus(monthlyPrincipal);

    if (i === tenureMonths) {
      balance = new Decimal(0);
    }

    schedule.push({
      installmentNumber: i,
      dueDate: addMonths(startDate, i),
      principalDue: monthlyPrincipal.toDecimalPlaces(2).toNumber(),
      interestDue: monthlyInterest.toDecimalPlaces(2).toNumber(),
      totalDue: monthlyInstalment.toDecimalPlaces(2).toNumber(),
      outstandingBalance: balance.toDecimalPlaces(2).toNumber(),
    });
  }

  return {
    totalInterest: totalInterest.toDecimalPlaces(2).toNumber(),
    totalRepayment: totalRepayment.toDecimalPlaces(2).toNumber(),
    monthlyInstalment: monthlyInstalment.toDecimalPlaces(2).toNumber(),
    schedule,
  };
}

/**
 * Calculate fixed deposit interest
 */
export function calculateFixedDepositInterest(
  principal: number,
  annualRate: number,
  tenureDays: number
): {
  interestAmount: number;
  maturityAmount: number;
  dailyInterest: number;
} {
  const principalDecimal = new Decimal(principal);
  const rate = new Decimal(annualRate).div(100);

  // Simple interest: P * R * T/365
  const interestAmount = principalDecimal.times(rate).times(tenureDays).div(365);
  const maturityAmount = principalDecimal.plus(interestAmount);
  const dailyInterest = interestAmount.div(tenureDays);

  return {
    interestAmount: interestAmount.toDecimalPlaces(2).toNumber(),
    maturityAmount: maturityAmount.toDecimalPlaces(2).toNumber(),
    dailyInterest: dailyInterest.toDecimalPlaces(6).toNumber(),
  };
}

/**
 * Calculate days between dates
 */
export function daysBetween(startDate: Date, endDate: Date): number {
  return differenceInDays(endDate, startDate);
}

/**
 * Get financial period (year-month)
 */
export function getFinancialPeriod(date: Date = new Date()): { year: number; month: number } {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

/**
 * Get period date range
 */
export function getPeriodDateRange(year: number, month: number): { start: Date; end: Date } {
  const date = new Date(year, month - 1, 1);
  return {
    start: startOfMonth(date),
    end: endOfMonth(date),
  };
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency: string = 'NGN'): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Mask sensitive data
 */
export function maskData(data: string, visibleChars: number = 4): string {
  if (data.length <= visibleChars * 2) {
    return '*'.repeat(data.length);
  }
  const start = data.slice(0, visibleChars);
  const end = data.slice(-visibleChars);
  const masked = '*'.repeat(data.length - visibleChars * 2);
  return `${start}${masked}${end}`;
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
}

/**
 * Parse boolean from various inputs
 */
export function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }
  if (typeof value === 'number') return value !== 0;
  return false;
}

/**
 * Deep clone object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Get object difference for audit
 */
export function getObjectDiff(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>
): {
  changedFields: string[];
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
} {
  const changedFields: string[] = [];
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    const oldVal = oldObj[key];
    const newVal = newObj[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changedFields.push(key);
      oldValues[key] = oldVal;
      newValues[key] = newVal;
    }
  }

  return { changedFields, oldValues, newValues };
}

/**
 * Sleep utility for retry logic
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
