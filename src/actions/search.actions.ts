'use server';

/**
 * Global search for the dashboard search bar.
 *
 * Scoped to what the signed-in user is allowed to see: a savings officer
 * searching a name gets customers and savings accounts, never loans. The same
 * departmental isolation the sidebar enforces has to hold here, or the search
 * bar becomes a way around it.
 */

import { prisma } from '@/lib/prisma';
import { getSession, hasAnyPermission } from '@/lib/auth-utils';

export type SearchResultKind = 'customer' | 'savings' | 'loan';

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const MIN_QUERY = 2;
const PER_KIND = 5;

export async function globalSearch(rawQuery: string): Promise<SearchResult[]> {
  const { user } = await getSession();
  const query = (rawQuery ?? '').trim();
  if (query.length < MIN_QUERY) return [];

  const like = { contains: query, mode: 'insensitive' as const };

  const canSeeCustomers = hasAnyPermission(user, ['CUSTOMERS:READ', 'CUSTOMERS:CREATE']);
  const canSeeSavings = hasAnyPermission(user, [
    'SAVINGS:READ', 'SAVINGS:CREATE', 'SAVINGS:TRANSACT', 'SAVINGS:DEPOSIT', 'SAVINGS:WITHDRAW',
  ]);
  const canSeeLoans = hasAnyPermission(user, [
    'LOANS:READ', 'LOANS:CREATE', 'LOANS:APPROVE', 'LOANS:APPROVE_L1', 'LOANS:APPROVE_L2',
    'LOANS:DISBURSE', 'LOANS:REPAYMENT', 'LOANS:MANAGE_ALL',
  ]);

  const [customers, savings, loans] = await Promise.all([
    canSeeCustomers
      ? prisma.customer.findMany({
          where: {
            OR: [
              { firstName: like }, { lastName: like },
              { customerNumber: like }, { phone: like }, { email: like },
            ],
          },
          select: { id: true, customerNumber: true, firstName: true, lastName: true, phone: true },
          take: PER_KIND,
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),

    canSeeSavings
      ? prisma.savingsAccount.findMany({
          where: {
            isDeleted: false,
            OR: [
              { accountNumber: like },
              { customer: { firstName: like } },
              { customer: { lastName: like } },
            ],
          },
          select: {
            id: true, accountNumber: true, currentBalance: true,
            customer: { select: { firstName: true, lastName: true } },
            product: { select: { name: true } },
          },
          take: PER_KIND,
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),

    canSeeLoans
      ? prisma.loan.findMany({
          where: {
            isDeleted: false,
            OR: [
              { loanNumber: like },
              { customer: { firstName: like } },
              { customer: { lastName: like } },
            ],
          },
          select: {
            id: true, loanNumber: true, status: true,
            customer: { select: { firstName: true, lastName: true } },
          },
          take: PER_KIND,
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
  ]);

  const naira = (n: unknown) =>
    Number(n ?? 0).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });

  return [
    ...customers.map((c) => ({
      kind: 'customer' as const,
      id: c.id,
      title: `${c.firstName} ${c.lastName}`,
      subtitle: `${c.customerNumber}${c.phone ? ` · ${c.phone}` : ''}`,
      href: `/customers/${c.id}`,
    })),
    ...savings.map((s) => ({
      kind: 'savings' as const,
      id: s.id,
      title: `${s.customer.firstName} ${s.customer.lastName}`,
      subtitle: `${s.accountNumber} · ${s.product.name} · ${naira(s.currentBalance)}`,
      href: `/savings/${s.id}`,
    })),
    ...loans.map((l) => ({
      kind: 'loan' as const,
      id: l.id,
      title: `${l.customer.firstName} ${l.customer.lastName}`,
      subtitle: `${l.loanNumber} · ${l.status}`,
      href: `/loans/${l.id}`,
    })),
  ];
}
