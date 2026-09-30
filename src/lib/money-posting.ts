/**
 * Posting customer money: savings deposits and loan repayments.
 *
 * The core of each posting — the balance or schedule update, the ledger entry
 * and the audit record — shared by the teller screens (processDeposit,
 * processRepayment) and by confirming a marketer's field collection.
 *
 * Server-only and deliberately NOT a server action: nothing here checks who
 * is asking. Every caller must authorise first — the teller actions check the
 * teller's permission and branch; confirmSale checks that the confirmer may
 * confirm sales. Never import this into a 'use server' file and re-export it.
 */
import { LoanStatus, ScheduleStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma, withTransaction } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { generateReference } from '@/lib/utils';
import { createJournalEntry, getAccountByCode } from '@/lib/accounting-engine';
import { createNotification } from '@/lib/notifications';
import type { ActionResult } from '@/types';

const SAVINGS_GL = {
  CASH: '1110',
  SAVINGS_LIABILITY: '2110',
};

const LOAN_GL = {
  LOANS_RECEIVABLE: '1310',
  CASH_BANK: '1120',
  INTEREST_INCOME: '4110',
};

/** Whoever the posting is recorded against (processedBy / collectedBy). */
export interface PostingActor {
  id: string;
}

/**
 * Deposit into a savings account - Posts GL: Dr Cash, Cr Savings Liability.
 * The caller has already authorised the actor for this account.
 */
export async function postSavingsDeposit(
  actor: PostingActor,
  data: {
    accountId: string;
    amount: number;
    paymentMode: string;
    paymentReference?: string;
    narration?: string;
  }
): Promise<ActionResult<{ transactionRef: string }>> {
  const account = await prisma.savingsAccount.findUnique({
    where: { id: data.accountId },
    include: { product: true, customer: true },
  });
  if (!account) return { success: false, error: 'Account not found' };
  if (account.status !== 'ACTIVE') return { success: false, error: 'Account is not active' };

  if (data.amount < account.product.minDeposit.toNumber()) {
    return { success: false, error: `Minimum deposit is ${account.product.minDeposit}` };
  }

  const transactionRef = await generateReference('SAVINGS_TXN');
  const balanceBefore = account.currentBalance.toNumber();
  const balanceAfter = new Decimal(balanceBefore).plus(data.amount).toNumber();

  await withTransaction(async (tx) => {
    await tx.savingsTransaction.create({
      data: {
        accountId: data.accountId,
        transactionRef,
        transactionType: 'DEPOSIT',
        amount: data.amount,
        balanceBefore,
        balanceAfter,
        paymentMode: data.paymentMode as any,
        paymentReference: data.paymentReference,
        narration: data.narration || 'Cash deposit',
        processedById: actor.id,
      },
    });

    await tx.savingsAccount.update({
      where: { id: data.accountId },
      data: {
        currentBalance: balanceAfter,
        availableBalance: balanceAfter,
        lastTransactionAt: new Date(),
      },
    });
  });

  // Post GL: Dr Cash, Cr Savings Liability
  const cashAccount = await getAccountByCode(SAVINGS_GL.CASH);
  const savingsLiability = await getAccountByCode(SAVINGS_GL.SAVINGS_LIABILITY);

  if (cashAccount && savingsLiability) {
    await createJournalEntry({
      entryDate: new Date(),
      description: `Savings deposit: ${account.accountNumber} - ${transactionRef}`,
      sourceModule: 'SAVINGS',
      sourceType: 'DEPOSIT',
      sourceId: data.accountId,
      savingsAccountId: data.accountId,
      lines: [
        { accountId: cashAccount.id, debitAmount: data.amount, description: `Cash deposit - ${account.accountNumber}` },
        { accountId: savingsLiability.id, creditAmount: data.amount, description: `Savings deposit - ${account.accountNumber}`, customerId: account.customerId },
      ],
      createdById: actor.id,
      autoPost: true,
    });
  }

  await auditLog({
    userId: actor.id, action: 'CREATE', module: 'SAVINGS', entityType: 'SAVINGS_TRANSACTION', entityId: data.accountId,
    description: `Deposit ${transactionRef}: ${data.amount} to ${account.accountNumber}`,
  });

  return { success: true, message: `Deposit of ${data.amount} successful. Ref: ${transactionRef}`, data: { transactionRef } };
}

/**
 * Repayment on a loan - Posts GL: Dr Cash, Cr Loans Receivable (principal),
 * Cr Interest Income. Allocated FIFO to the oldest unpaid instalment,
 * interest before principal. The caller has already authorised the actor.
 */
export async function postLoanRepayment(
  actor: PostingActor,
  data: {
    loanId: string;
    amount: number;
    paymentMode: string;
    paymentReference?: string;
    notes?: string;
  }
): Promise<ActionResult<{ receiptNumber: string; principalPaid: number; interestPaid: number }>> {
  const loan = await prisma.loan.findUnique({
    where: { id: data.loanId },
    include: {
      customer: true,
      schedule: { where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } }, orderBy: { installmentNumber: 'asc' } },
    },
  });
  if (!loan) return { success: false, error: 'Loan not found' };
  if (loan.status !== 'ACTIVE' && loan.status !== 'OVERDUE') {
    return { success: false, error: `Cannot process repayment for loan with status ${loan.status}` };
  }

  let remainingAmount = new Decimal(data.amount);
  let totalPrincipal = new Decimal(0);
  let totalInterest = new Decimal(0);
  let scheduleId: string | null = null;

  const receiptNumber = await generateReference('RECEIPT');

  await withTransaction(async (tx) => {
    // FIFO: Allocate to oldest unpaid schedule first, interest before principal
    for (const schedule of loan.schedule) {
      if (remainingAmount.lte(0)) break;

      const interestOwed = new Decimal(schedule.interestDue.toString()).minus(schedule.interestPaid.toString());
      const principalOwed = new Decimal(schedule.principalDue.toString()).minus(schedule.principalPaid.toString());

      let interestPaid = new Decimal(0);
      let principalPaid = new Decimal(0);

      // Pay interest first
      if (interestOwed.gt(0) && remainingAmount.gt(0)) {
        interestPaid = Decimal.min(interestOwed, remainingAmount);
        remainingAmount = remainingAmount.minus(interestPaid);
        totalInterest = totalInterest.plus(interestPaid);
      }

      // Then principal
      if (principalOwed.gt(0) && remainingAmount.gt(0)) {
        principalPaid = Decimal.min(principalOwed, remainingAmount);
        remainingAmount = remainingAmount.minus(principalPaid);
        totalPrincipal = totalPrincipal.plus(principalPaid);
      }

      if (interestPaid.gt(0) || principalPaid.gt(0)) {
        const newInterestPaid = new Decimal(schedule.interestPaid.toString()).plus(interestPaid);
        const newPrincipalPaid = new Decimal(schedule.principalPaid.toString()).plus(principalPaid);
        const newTotalPaid = newInterestPaid.plus(newPrincipalPaid);
        const totalDue = new Decimal(schedule.totalDue.toString());

        const newStatus = newTotalPaid.gte(totalDue) ? ScheduleStatus.PAID
          : newTotalPaid.gt(0) ? ScheduleStatus.PARTIAL
          : schedule.status;

        await tx.loanSchedule.update({
          where: { id: schedule.id },
          data: {
            interestPaid: newInterestPaid.toNumber(),
            principalPaid: newPrincipalPaid.toNumber(),
            totalPaid: newTotalPaid.toNumber(),
            status: newStatus,
            paidDate: newStatus === 'PAID' ? new Date() : undefined,
          },
        });

        if (!scheduleId) scheduleId = schedule.id;
      }
    }

    // Create repayment record
    await tx.loanRepayment.create({
      data: {
        loanId: data.loanId,
        scheduleId,
        receiptNumber,
        amount: data.amount,
        principalPortion: totalPrincipal.toNumber(),
        interestPortion: totalInterest.toNumber(),
        paymentMode: data.paymentMode as any,
        paymentReference: data.paymentReference,
        collectedById: actor.id,
        notes: data.notes,
      },
    });

    // Check if loan is fully repaid
    const unpaidSchedules = await tx.loanSchedule.count({
      where: { loanId: data.loanId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
    });

    if (unpaidSchedules === 0) {
      await tx.loan.update({
        where: { id: data.loanId },
        data: { status: LoanStatus.CLOSED, closedAt: new Date() },
      });
    }
  });

  // Post GL: Dr Cash, Cr Loans Receivable (principal), Cr Interest Income
  const loansReceivable = await getAccountByCode(LOAN_GL.LOANS_RECEIVABLE);
  const cashBank = await getAccountByCode(LOAN_GL.CASH_BANK);
  const interestIncome = await getAccountByCode(LOAN_GL.INTEREST_INCOME);

  if (loansReceivable && cashBank && interestIncome) {
    const glLines = [
      {
        accountId: cashBank.id,
        debitAmount: data.amount,
        creditAmount: 0,
        description: `Loan repayment - ${loan.loanNumber}`,
      },
    ];

    if (totalPrincipal.gt(0)) {
      glLines.push({
        accountId: loansReceivable.id,
        debitAmount: 0,
        creditAmount: totalPrincipal.toNumber(),
        description: `Principal repayment - ${loan.loanNumber}`,
        customerId: loan.customerId,
        referenceType: 'LOAN',
        referenceId: loan.id,
      } as any);
    }

    if (totalInterest.gt(0)) {
      glLines.push({
        accountId: interestIncome.id,
        debitAmount: 0,
        creditAmount: totalInterest.toNumber(),
        description: `Interest payment - ${loan.loanNumber}`,
      });
    }

    await createJournalEntry({
      entryDate: new Date(),
      description: `Loan repayment: ${loan.loanNumber} - ${receiptNumber}`,
      sourceModule: 'LOANS',
      sourceType: 'REPAYMENT',
      sourceId: loan.id,
      loanId: loan.id,
      lines: glLines,
      createdById: actor.id,
      autoPost: true,
    });
  }

  await auditLog({
    userId: actor.id, action: 'CREATE', module: 'LOANS', entityType: 'LOAN_REPAYMENT', entityId: data.loanId,
    description: `Repayment ${receiptNumber}: ${data.amount} for loan ${loan.loanNumber}`,
  });

  // Notify the loan officer who created the loan
  if (loan.createdById !== actor.id) {
    await createNotification({
      userId: loan.createdById,
      type: 'PAYMENT_RECEIVED',
      title: 'Loan Repayment Received',
      message: `Payment of ${data.amount} received for loan ${loan.loanNumber}. Receipt: ${receiptNumber}`,
      entityType: 'LOAN',
      entityId: data.loanId,
      actionUrl: `/loans/${data.loanId}`,
    });
  }

  return {
    success: true,
    message: `Payment of ${data.amount} received. Receipt: ${receiptNumber}`,
    data: { receiptNumber, principalPaid: totalPrincipal.toNumber(), interestPaid: totalInterest.toNumber() },
  };
}
