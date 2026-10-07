/**
 * Reading where application fees stand, for the screens that show them.
 *
 * Server-only and deliberately NOT a server action: nothing here checks who
 * is asking. Callers authorise first (application.actions, fee.actions).
 */
import { prisma } from '@/lib/prisma';
import { feePosition, type FeePosition } from '@/lib/fees';

export interface FeeSummary extends FeePosition {
  basis: string | null;
  discountReason: string | null;
  discountBy: string | null;
  payments: {
    id: string;
    receiptNumber: string;
    amount: number;
    paymentMode: string;
    paymentReference: string | null;
    receivedAt: string;
    receivedBy: string;
    reversed: { at: string; by: string | null; reason: string | null } | null;
  }[];
}

const name = (s?: { firstName: string; lastName: string } | null) => (s ? `${s.firstName} ${s.lastName}` : null);

/** Each response's fee, discount, payments and balance. Reversed payments are listed but not counted. */
export async function feeSummaries(responseIds: string[]): Promise<Map<string, FeeSummary>> {
  const out = new Map<string, FeeSummary>();
  if (!responseIds.length) return out;
  const rows = await prisma.formResponse.findMany({
    where: { id: { in: responseIds } },
    select: {
      id: true, feeDue: true, feeBasis: true, feeDiscount: true, discountReason: true,
      discountBy: { select: { firstName: true, lastName: true } },
      feePayments: {
        orderBy: { receivedAt: 'asc' },
        include: {
          receivedBy: { select: { firstName: true, lastName: true } },
          reversedBy: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  for (const r of rows) {
    const paid = r.feePayments.filter((p) => !p.reversedAt).reduce((t, p) => t + p.amount.toNumber(), 0);
    out.set(r.id, {
      ...feePosition(r.feeDue?.toNumber() ?? null, r.feeDiscount.toNumber(), paid),
      basis: r.feeBasis,
      discountReason: r.discountReason,
      discountBy: name(r.discountBy),
      payments: r.feePayments.map((p) => ({
        id: p.id,
        receiptNumber: p.receiptNumber,
        amount: p.amount.toNumber(),
        paymentMode: p.paymentMode,
        paymentReference: p.paymentReference,
        receivedAt: p.receivedAt.toISOString(),
        receivedBy: name(p.receivedBy) ?? '',
        reversed: p.reversedAt ? { at: p.reversedAt.toISOString(), by: name(p.reversedBy), reason: p.reversalReason } : null,
      })),
    });
  }
  return out;
}
