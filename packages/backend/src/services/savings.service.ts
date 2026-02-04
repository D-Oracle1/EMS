/**
 * Hylink EMS - Savings Service
 * Handles all savings operations with automatic journal posting
 *
 * Savings Types:
 * - Daily Savings
 * - Target Savings
 * - Fixed Savings
 * - Corporate Savings
 */

import { Prisma, AccountStatus, SavingsTransactionType, JournalEntryType, PaymentMode } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma, withTransaction } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { accountingService } from './accounting.service.js';
import { generateReference } from '../utils/helpers.js';
import {
  NotFoundError,
  BusinessError,
  InsufficientBalanceError,
} from '../utils/errors.js';
import { PaginatedResult, PaginationParams } from '../types/index.js';

// Account codes for savings accounting
const SAVINGS_ACCOUNTS = {
  CASH_BANK: '1100', // Asset - Cash/Bank
  SAVINGS_LIABILITY: '2100', // Liability - Customer Savings
  INTEREST_EXPENSE: '5200', // Expense - Interest Paid to Customers
};

interface CreateSavingsAccountInput {
  customerId: string;
  productId: string;
  branchId?: string;
  targetAmount?: number;
  targetDate?: Date;
}

interface DepositInput {
  accountId: string;
  amount: number;
  paymentMode: PaymentMode;
  paymentReference?: string;
  description?: string;
  processedById: string;
}

interface WithdrawalInput {
  accountId: string;
  amount: number;
  paymentMode: PaymentMode;
  paymentReference?: string;
  description?: string;
  processedById: string;
}

interface SavingsFilters {
  customerId?: string;
  productId?: string;
  branchId?: string;
  staffId?: string;
  savingsType?: string;
  status?: AccountStatus;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

interface TransactionFilters {
  accountId?: string;
  transactionType?: SavingsTransactionType;
  startDate?: Date;
  endDate?: Date;
  processedById?: string;
}

export class SavingsService {
  /**
   * Create new savings account
   */
  async createAccount(input: CreateSavingsAccountInput): Promise<{
    id: string;
    accountNumber: string;
  }> {
    const { customerId, productId, branchId, targetAmount, targetDate } = input;

    // Validate customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer || customer.status !== 'ACTIVE') {
      throw new NotFoundError('Active customer not found');
    }

    // Validate product
    const product = await prisma.savingsProduct.findUnique({
      where: { id: productId },
    });

    if (!product || !product.isActive) {
      throw new NotFoundError('Active savings product not found');
    }

    // Generate account number
    const accountNumber = await generateReference('SAVINGS_ACCOUNT');

    const account = await prisma.savingsAccount.create({
      data: {
        accountNumber,
        customerId,
        productId,
        branchId,
        targetAmount,
        targetDate,
        status: AccountStatus.ACTIVE,
      },
    });

    logger.info('Savings account created', { accountNumber, customerId });

    return { id: account.id, accountNumber };
  }

  /**
   * Get savings account by ID with full details
   */
  async getAccountById(id: string): Promise<Prisma.SavingsAccountGetPayload<{
    include: {
      customer: true;
      product: true;
      branch: true;
      transactions: {
        take: 10;
        orderBy: { processedAt: 'desc' };
      };
    };
  }> | null> {
    return prisma.savingsAccount.findUnique({
      where: { id },
      include: {
        customer: true,
        product: true,
        branch: true,
        transactions: {
          take: 10,
          orderBy: { processedAt: 'desc' },
        },
      },
    });
  }

  /**
   * Get savings accounts with filters
   */
  async getAccounts(
    filters: SavingsFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Prisma.SavingsAccountGetPayload<{
    include: {
      customer: { select: { firstName: true; lastName: true; customerNumber: true } };
      product: { select: { name: true; code: true; savingsType: true } };
    };
  }>>> {
    const { page, limit, sortBy = 'openedAt', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.SavingsAccountWhereInput = {};

    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.productId) where.productId = filters.productId;
    if (filters.branchId) where.branchId = filters.branchId;
    if (filters.status) where.status = filters.status;

    if (filters.savingsType) {
      where.product = { savingsType: filters.savingsType as any };
    }

    if (filters.search) {
      where.OR = [
        { accountNumber: { contains: filters.search, mode: 'insensitive' } },
        { customer: { firstName: { contains: filters.search, mode: 'insensitive' } } },
        { customer: { lastName: { contains: filters.search, mode: 'insensitive' } } },
        { customer: { customerNumber: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const [accounts, total] = await Promise.all([
      prisma.savingsAccount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          customer: {
            select: { firstName: true, lastName: true, customerNumber: true },
          },
          product: {
            select: { name: true, code: true, savingsType: true },
          },
        },
      }),
      prisma.savingsAccount.count({ where }),
    ]);

    return {
      data: accounts,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Process deposit - auto-posts journal entry
   */
  async processDeposit(input: DepositInput): Promise<{
    transactionRef: string;
    journalEntryId: string;
    newBalance: number;
  }> {
    const { accountId, amount, paymentMode, paymentReference, description, processedById } = input;

    if (amount <= 0) {
      throw new BusinessError('Deposit amount must be positive');
    }

    const account = await prisma.savingsAccount.findUnique({
      where: { id: accountId },
      include: { customer: true, product: true },
    });

    if (!account) {
      throw new NotFoundError('Savings account not found');
    }

    if (account.status !== AccountStatus.ACTIVE) {
      throw new BusinessError(`Account is ${account.status.toLowerCase()}`);
    }

    // Check minimum deposit
    if (amount < account.product.minDeposit.toNumber()) {
      throw new BusinessError(`Minimum deposit is ${account.product.minDeposit}`);
    }

    // Get accounts for journal
    const cashBank = await prisma.chartOfAccounts.findFirst({
      where: { accountCode: SAVINGS_ACCOUNTS.CASH_BANK },
    });

    const savingsLiability = await prisma.chartOfAccounts.findFirst({
      where: { accountCode: SAVINGS_ACCOUNTS.SAVINGS_LIABILITY },
    });

    if (!cashBank || !savingsLiability) {
      throw new BusinessError('Required accounting accounts not configured');
    }

    const transactionRef = await generateReference('SAVINGS_TXN');
    const balanceBefore = account.currentBalance.toNumber();
    const balanceAfter = new Decimal(balanceBefore).plus(amount).toNumber();

    const result = await withTransaction(async (tx) => {
      // Create journal entry
      // Debit: Cash/Bank
      // Credit: Savings Liability
      const journalEntry = await accountingService.createJournalEntry({
        entryDate: new Date(),
        entryType: JournalEntryType.STANDARD,
        description: `Savings deposit - ${account.accountNumber} - ${account.customer.firstName} ${account.customer.lastName}`,
        sourceModule: 'SAVINGS',
        sourceType: 'DEPOSIT',
        sourceId: accountId,
        savingsAccountId: accountId,
        branchId: account.branchId ?? undefined,
        lines: [
          {
            accountId: cashBank!.id,
            debitAmount: amount,
            description: 'Cash received',
          },
          {
            accountId: savingsLiability!.id,
            creditAmount: amount,
            description: 'Customer savings liability',
            customerId: account.customerId,
            referenceType: 'SAVINGS',
            referenceId: accountId,
          },
        ],
        createdById: processedById,
        autoPost: true,
      });

      // Create transaction record
      const transaction = await tx.savingsTransaction.create({
        data: {
          accountId,
          transactionRef,
          transactionType: SavingsTransactionType.DEPOSIT,
          amount,
          balanceBefore,
          balanceAfter,
          paymentMode,
          paymentReference,
          description,
          narration: `Deposit via ${paymentMode}`,
          processedById,
          journalEntryId: journalEntry.id,
        },
      });

      // Update account balance
      await tx.savingsAccount.update({
        where: { id: accountId },
        data: {
          currentBalance: balanceAfter,
          availableBalance: balanceAfter,
          lastTransactionAt: new Date(),
        },
      });

      return { transaction, journalEntry };
    });

    logger.info('Savings deposit processed', {
      accountId,
      transactionRef,
      amount,
      newBalance: balanceAfter,
    });

    return {
      transactionRef,
      journalEntryId: result.journalEntry.id,
      newBalance: balanceAfter,
    };
  }

  /**
   * Process withdrawal - auto-posts journal entry
   */
  async processWithdrawal(input: WithdrawalInput): Promise<{
    transactionRef: string;
    journalEntryId: string;
    newBalance: number;
  }> {
    const { accountId, amount, paymentMode, paymentReference, description, processedById } = input;

    if (amount <= 0) {
      throw new BusinessError('Withdrawal amount must be positive');
    }

    const account = await prisma.savingsAccount.findUnique({
      where: { id: accountId },
      include: { customer: true, product: true },
    });

    if (!account) {
      throw new NotFoundError('Savings account not found');
    }

    if (account.status !== AccountStatus.ACTIVE) {
      throw new BusinessError(`Account is ${account.status.toLowerCase()}`);
    }

    // Check if withdrawals are allowed
    if (!account.product.allowWithdrawal) {
      throw new BusinessError('Withdrawals are not allowed on this account type');
    }

    // Check available balance
    const availableBalance = account.availableBalance.toNumber();
    if (amount > availableBalance) {
      throw new InsufficientBalanceError(
        `Insufficient balance. Available: ${availableBalance}, Requested: ${amount}`
      );
    }

    // Check minimum balance requirement
    const remainingBalance = new Decimal(availableBalance).minus(amount);
    if (remainingBalance.lt(account.product.minBalance)) {
      throw new BusinessError(
        `Withdrawal would breach minimum balance requirement of ${account.product.minBalance}`
      );
    }

    // Check daily withdrawal limit
    if (account.product.maxDailyWithdrawal) {
      const todayWithdrawals = await prisma.savingsTransaction.aggregate({
        where: {
          accountId,
          transactionType: SavingsTransactionType.WITHDRAWAL,
          processedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
        _sum: { amount: true },
      });

      const totalToday = (todayWithdrawals._sum.amount?.toNumber() || 0) + amount;
      if (totalToday > account.product.maxDailyWithdrawal.toNumber()) {
        throw new BusinessError(
          `Withdrawal would exceed daily limit of ${account.product.maxDailyWithdrawal}`
        );
      }
    }

    // Get accounts for journal
    const cashBank = await prisma.chartOfAccounts.findFirst({
      where: { accountCode: SAVINGS_ACCOUNTS.CASH_BANK },
    });

    const savingsLiability = await prisma.chartOfAccounts.findFirst({
      where: { accountCode: SAVINGS_ACCOUNTS.SAVINGS_LIABILITY },
    });

    if (!cashBank || !savingsLiability) {
      throw new BusinessError('Required accounting accounts not configured');
    }

    const transactionRef = await generateReference('SAVINGS_TXN');
    const balanceBefore = account.currentBalance.toNumber();
    const balanceAfter = new Decimal(balanceBefore).minus(amount).toNumber();

    const result = await withTransaction(async (tx) => {
      // Create journal entry
      // Debit: Savings Liability
      // Credit: Cash/Bank
      const journalEntry = await accountingService.createJournalEntry({
        entryDate: new Date(),
        entryType: JournalEntryType.STANDARD,
        description: `Savings withdrawal - ${account.accountNumber} - ${account.customer.firstName} ${account.customer.lastName}`,
        sourceModule: 'SAVINGS',
        sourceType: 'WITHDRAWAL',
        sourceId: accountId,
        savingsAccountId: accountId,
        branchId: account.branchId ?? undefined,
        lines: [
          {
            accountId: savingsLiability!.id,
            debitAmount: amount,
            description: 'Customer savings withdrawal',
            customerId: account.customerId,
            referenceType: 'SAVINGS',
            referenceId: accountId,
          },
          {
            accountId: cashBank!.id,
            creditAmount: amount,
            description: 'Cash paid out',
          },
        ],
        createdById: processedById,
        autoPost: true,
      });

      // Create transaction record
      const transaction = await tx.savingsTransaction.create({
        data: {
          accountId,
          transactionRef,
          transactionType: SavingsTransactionType.WITHDRAWAL,
          amount,
          balanceBefore,
          balanceAfter,
          paymentMode,
          paymentReference,
          description,
          narration: `Withdrawal via ${paymentMode}`,
          processedById,
          journalEntryId: journalEntry.id,
        },
      });

      // Update account balance
      await tx.savingsAccount.update({
        where: { id: accountId },
        data: {
          currentBalance: balanceAfter,
          availableBalance: balanceAfter,
          lastTransactionAt: new Date(),
        },
      });

      return { transaction, journalEntry };
    });

    logger.info('Savings withdrawal processed', {
      accountId,
      transactionRef,
      amount,
      newBalance: balanceAfter,
    });

    return {
      transactionRef,
      journalEntryId: result.journalEntry.id,
      newBalance: balanceAfter,
    };
  }

  /**
   * Get account statement
   */
  async getAccountStatement(
    accountId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    account: {
      accountNumber: string;
      customerName: string;
      productName: string;
      openingBalance: number;
      closingBalance: number;
    };
    transactions: Array<{
      date: Date;
      reference: string;
      type: string;
      description: string;
      debit: number;
      credit: number;
      balance: number;
    }>;
    summary: {
      totalDeposits: number;
      totalWithdrawals: number;
      depositCount: number;
      withdrawalCount: number;
    };
  }> {
    const account = await prisma.savingsAccount.findUnique({
      where: { id: accountId },
      include: { customer: true, product: true },
    });

    if (!account) {
      throw new NotFoundError('Savings account not found');
    }

    // Get opening balance (balance before start date)
    const openingBalanceTxn = await prisma.savingsTransaction.findFirst({
      where: {
        accountId,
        processedAt: { lt: startDate },
      },
      orderBy: { processedAt: 'desc' },
    });

    const openingBalance = openingBalanceTxn?.balanceAfter.toNumber() || 0;

    // Get transactions within date range
    const transactions = await prisma.savingsTransaction.findMany({
      where: {
        accountId,
        processedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { processedAt: 'asc' },
    });

    // Calculate summary
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let depositCount = 0;
    let withdrawalCount = 0;

    const formattedTransactions = transactions.map(txn => {
      const isDebit = [SavingsTransactionType.WITHDRAWAL, SavingsTransactionType.FEE_DEBIT, SavingsTransactionType.TRANSFER_OUT].includes(txn.transactionType);

      if (isDebit) {
        totalWithdrawals += txn.amount.toNumber();
        withdrawalCount++;
      } else {
        totalDeposits += txn.amount.toNumber();
        depositCount++;
      }

      return {
        date: txn.processedAt,
        reference: txn.transactionRef,
        type: txn.transactionType,
        description: txn.narration || txn.description || '',
        debit: isDebit ? txn.amount.toNumber() : 0,
        credit: !isDebit ? txn.amount.toNumber() : 0,
        balance: txn.balanceAfter.toNumber(),
      };
    });

    const closingBalance = transactions.length > 0
      ? transactions[transactions.length - 1].balanceAfter.toNumber()
      : openingBalance;

    return {
      account: {
        accountNumber: account.accountNumber,
        customerName: `${account.customer.firstName} ${account.customer.lastName}`,
        productName: account.product.name,
        openingBalance,
        closingBalance,
      },
      transactions: formattedTransactions,
      summary: {
        totalDeposits,
        totalWithdrawals,
        depositCount,
        withdrawalCount,
      },
    };
  }

  /**
   * Get transactions with filters (for officer dashboard)
   */
  async getTransactions(
    filters: TransactionFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Prisma.SavingsTransactionGetPayload<{
    include: {
      account: {
        select: {
          accountNumber: true;
          customer: { select: { firstName: true; lastName: true } };
        };
      };
      processedBy: { select: { firstName: true; lastName: true } };
    };
  }>>> {
    const { page, limit, sortBy = 'processedAt', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.SavingsTransactionWhereInput = {};

    if (filters.accountId) where.accountId = filters.accountId;
    if (filters.transactionType) where.transactionType = filters.transactionType;
    if (filters.processedById) where.processedById = filters.processedById;

    if (filters.startDate && filters.endDate) {
      where.processedAt = {
        gte: filters.startDate,
        lte: filters.endDate,
      };
    }

    const [transactions, total] = await Promise.all([
      prisma.savingsTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          account: {
            select: {
              accountNumber: true,
              customer: { select: { firstName: true, lastName: true } },
            },
          },
          processedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.savingsTransaction.count({ where }),
    ]);

    return {
      data: transactions,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get savings summary for dashboard
   */
  async getSavingsSummary(branchId?: string): Promise<{
    totalAccounts: number;
    activeAccounts: number;
    totalDeposits: number;
    totalBalance: number;
    byProductType: Array<{
      productName: string;
      savingsType: string;
      accountCount: number;
      totalBalance: number;
    }>;
  }> {
    const where: Prisma.SavingsAccountWhereInput = {};
    if (branchId) {
      where.branchId = branchId;
    }

    const [totalAccounts, activeAccounts, balanceSum, byProduct] = await Promise.all([
      prisma.savingsAccount.count({ where }),
      prisma.savingsAccount.count({ where: { ...where, status: AccountStatus.ACTIVE } }),
      prisma.savingsAccount.aggregate({
        where,
        _sum: { currentBalance: true },
      }),
      prisma.savingsAccount.groupBy({
        by: ['productId'],
        where,
        _count: { id: true },
        _sum: { currentBalance: true },
      }),
    ]);

    // Get product details
    const products = await prisma.savingsProduct.findMany({
      where: { id: { in: byProduct.map(p => p.productId) } },
    });

    const byProductType = byProduct.map(p => {
      const product = products.find(pr => pr.id === p.productId);
      return {
        productName: product?.name || 'Unknown',
        savingsType: product?.savingsType || 'Unknown',
        accountCount: p._count.id,
        totalBalance: p._sum.currentBalance?.toNumber() || 0,
      };
    });

    // Get total deposits
    const depositSum = await prisma.savingsTransaction.aggregate({
      where: {
        transactionType: SavingsTransactionType.DEPOSIT,
        account: where,
      },
      _sum: { amount: true },
    });

    return {
      totalAccounts,
      activeAccounts,
      totalDeposits: depositSum._sum.amount?.toNumber() || 0,
      totalBalance: balanceSum._sum.currentBalance?.toNumber() || 0,
      byProductType,
    };
  }
}

export const savingsService = new SavingsService();
