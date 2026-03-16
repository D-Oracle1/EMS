import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Decimal from 'decimal.js';
import { prisma } from './prisma';

// Configure Decimal.js for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency (Nigerian Naira)
 */
export function formatCurrency(amount: number | string | Decimal): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : typeof amount === 'number' ? amount : amount.toNumber();
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
  }).format(num);
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format date and time
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Generate sequential reference numbers
 */
export async function generateReference(sequenceCode: string): Promise<string> {
  const sequence = await prisma.sequence.update({
    where: { code: sequenceCode },
    data: { currentValue: { increment: 1 } },
  });

  const paddedValue = sequence.currentValue.toString().padStart(sequence.padLength, '0');
  return `${sequence.prefix}${paddedValue}`;
}

/**
 * Get financial period from date
 */
export function getFinancialPeriod(date: Date): { year: number; month: number } {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

/**
 * Get period date range
 */
export function getPeriodDateRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // Last day of month
  return { start, end };
}

/**
 * Calculate reducing balance loan schedule
 */
export function calculateReducingBalanceSchedule(
  principal: number,
  annualRate: number,
  tenureMonths: number,
  startDate: Date
): {
  schedule: Array<{
    installmentNumber: number;
    dueDate: Date;
    principalDue: number;
    interestDue: number;
    totalDue: number;
    outstandingBalance: number;
  }>;
  totalInterest: number;
  totalRepayment: number;
  monthlyInstalment: number;
} {
  const monthlyRate = new Decimal(annualRate).div(100).div(12);
  const P = new Decimal(principal);

  // EMI = P * r * (1+r)^n / ((1+r)^n - 1)
  const onePlusR = monthlyRate.plus(1);
  const onePlusRPowN = onePlusR.pow(tenureMonths);
  const emi = P.times(monthlyRate).times(onePlusRPowN).div(onePlusRPowN.minus(1)).toDecimalPlaces(2);

  const schedule = [];
  let balance = P;
  let totalInterest = new Decimal(0);

  for (let i = 1; i <= tenureMonths; i++) {
    const interestDue = balance.times(monthlyRate).toDecimalPlaces(2);
    const principalDue = i === tenureMonths
      ? balance // Last installment pays off remaining balance
      : emi.minus(interestDue).toDecimalPlaces(2);
    const totalDue = principalDue.plus(interestDue).toDecimalPlaces(2);

    balance = balance.minus(principalDue).toDecimalPlaces(2);
    totalInterest = totalInterest.plus(interestDue);

    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    schedule.push({
      installmentNumber: i,
      dueDate,
      principalDue: principalDue.toNumber(),
      interestDue: interestDue.toNumber(),
      totalDue: totalDue.toNumber(),
      outstandingBalance: balance.toNumber(),
    });
  }

  return {
    schedule,
    totalInterest: totalInterest.toNumber(),
    totalRepayment: P.plus(totalInterest).toNumber(),
    monthlyInstalment: emi.toNumber(),
  };
}

/**
 * Calculate flat rate loan schedule
 */
export function calculateFlatRateSchedule(
  principal: number,
  annualRate: number,
  tenureMonths: number,
  startDate: Date
): {
  schedule: Array<{
    installmentNumber: number;
    dueDate: Date;
    principalDue: number;
    interestDue: number;
    totalDue: number;
    outstandingBalance: number;
  }>;
  totalInterest: number;
  totalRepayment: number;
  monthlyInstalment: number;
} {
  const P = new Decimal(principal);
  const totalInterest = P.times(annualRate).div(100).times(tenureMonths).div(12).toDecimalPlaces(2);
  const totalRepayment = P.plus(totalInterest);
  const monthlyInstalment = totalRepayment.div(tenureMonths).toDecimalPlaces(2);
  const monthlyPrincipal = P.div(tenureMonths).toDecimalPlaces(2);
  const monthlyInterest = totalInterest.div(tenureMonths).toDecimalPlaces(2);

  const schedule = [];
  let balance = P;

  for (let i = 1; i <= tenureMonths; i++) {
    const principalDue = i === tenureMonths
      ? balance
      : monthlyPrincipal;
    const interestDue = monthlyInterest;
    const totalDue = principalDue.plus(interestDue).toDecimalPlaces(2);

    balance = balance.minus(principalDue).toDecimalPlaces(2);

    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    schedule.push({
      installmentNumber: i,
      dueDate,
      principalDue: principalDue.toNumber(),
      interestDue: interestDue.toNumber(),
      totalDue: totalDue.toNumber(),
      outstandingBalance: balance.toNumber(),
    });
  }

  return {
    schedule,
    totalInterest: totalInterest.toNumber(),
    totalRepayment: totalRepayment.toNumber(),
    monthlyInstalment: monthlyInstalment.toNumber(),
  };
}
