/**
 * Cheques handed in as security for a loan, by the borrower or a guarantor.
 * Each needs a bank and a cheque number; amount and the date written on the
 * cheque are optional.
 */

export interface ChequeInput {
  bankName: string;
  chequeNumber: string;
  amount?: number | null;
  /** Date on the cheque, YYYY-MM-DD. */
  chequeDate?: string | null;
}

export interface CleanCheque {
  bankName: string;
  chequeNumber: string;
  amount: number | null;
  chequeDate: Date | null;
}

const blank = (c: Partial<ChequeInput>) =>
  !c.bankName?.trim() && !c.chequeNumber?.trim() && !c.amount && !c.chequeDate;

/**
 * The cheques worth saving, or the first problem. Rows left entirely blank are
 * dropped; a row with anything in it needs a bank and a cheque number.
 */
export function cleanCheques(
  cheques: Partial<ChequeInput>[] | undefined,
  who = 'Cheque'
): { cheques: CleanCheque[]; error: string | null } {
  const out: CleanCheque[] = [];
  for (const [i, c] of (cheques ?? []).entries()) {
    if (blank(c)) continue;
    const label = `${who} ${i + 1}`;
    if (!c.bankName?.trim()) return { cheques: [], error: `${label}: enter the bank` };
    if (!c.chequeNumber?.trim()) return { cheques: [], error: `${label}: enter the cheque number` };
    const amount = c.amount == null || c.amount === ('' as never) ? null : Number(c.amount);
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
      return { cheques: [], error: `${label}: the amount is not valid` };
    }
    let chequeDate: Date | null = null;
    if (c.chequeDate) {
      chequeDate = new Date(c.chequeDate);
      if (Number.isNaN(chequeDate.getTime())) return { cheques: [], error: `${label}: the date is not valid` };
    }
    out.push({ bankName: c.bankName.trim(), chequeNumber: c.chequeNumber.trim(), amount, chequeDate });
  }
  return { cheques: out, error: null };
}
