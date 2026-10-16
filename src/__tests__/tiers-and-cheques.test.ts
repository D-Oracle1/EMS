/**
 * Customer KYC tiers and loan cheques.
 *
 *  - Tier 1 needs no BVN or NIN, Tier 2 one of them, Tier 3 both.
 *  - A cheque needs a bank and a number; blank rows are dropped.
 *  - Guarantor forms ask about cheques, including forms published before.
 */
import { describe, it, expect } from 'vitest';
import { resolveTier, tierFromIds, tierIdProblem } from '@/lib/customer-tier';
import { cleanCheques } from '@/lib/loan-cheques';
import { guarantorCheques, withGuarantorCheques, customerFormTemplate } from '@/lib/customer-forms';
import { validateNewCustomer } from '@/lib/customer-registration';
import type { FormQuestion } from '@/lib/forms';

describe('customer tiers', () => {
  it('Tier 1 needs no IDs', () => {
    expect(tierIdProblem(1, '', '')).toBeNull();
  });

  it('Tier 2 needs a BVN or a NIN', () => {
    expect(tierIdProblem(2, '', '')).toMatch(/BVN or a NIN/);
    expect(tierIdProblem(2, '12345678901', '')).toBeNull();
    expect(tierIdProblem(2, '', '98765432100')).toBeNull();
  });

  it('Tier 3 needs both', () => {
    expect(tierIdProblem(3, '12345678901', '')).toMatch(/both/);
    expect(tierIdProblem(3, '12345678901', '98765432100')).toBeNull();
  });

  it('gives the highest tier the IDs support when none is chosen', () => {
    expect(tierFromIds(null, null)).toBe(1);
    expect(tierFromIds('1', '  ')).toBe(2);
    expect(tierFromIds('1', '2')).toBe(3);
    expect(resolveTier(undefined, '1', '2')).toEqual({ tier: 3, error: null });
  });

  it('accepts a chosen tier as a string and rejects an unknown one', () => {
    expect(resolveTier('2', '1', '')).toEqual({ tier: 2, error: null });
    expect(resolveTier(4, '', '').error).toMatch(/Tier 1, 2 or 3/);
  });

  it('stops registering a Tier 3 customer without both IDs', () => {
    const base = { firstName: 'Ada', lastName: 'Obi', phone: '0801', address: '1 Road' };
    expect(validateNewCustomer({ ...base, tier: 3, bvn: '12345678901' })).toMatch(/both/);
    expect(validateNewCustomer({ ...base, tier: 1 })).toBeNull();
  });
});

describe('cleanCheques', () => {
  it('drops blank rows and keeps complete ones', () => {
    const { cheques, error } = cleanCheques([
      { bankName: '', chequeNumber: '' },
      { bankName: ' GTBank ', chequeNumber: '0001', amount: 50000, chequeDate: '2026-11-01' },
    ]);
    expect(error).toBeNull();
    expect(cheques).toHaveLength(1);
    expect(cheques[0]).toMatchObject({ bankName: 'GTBank', chequeNumber: '0001', amount: 50000 });
    expect(cheques[0].chequeDate?.toISOString().slice(0, 10)).toBe('2026-11-01');
  });

  it('needs a bank and a cheque number on a started row', () => {
    expect(cleanCheques([{ bankName: 'GTBank', chequeNumber: '' }]).error).toMatch(/cheque number/);
    expect(cleanCheques([{ bankName: '', chequeNumber: '1' }], 'Guarantor 1 cheque').error).toMatch(/Guarantor 1 cheque 1: enter the bank/);
  });

  it('rejects a negative amount', () => {
    expect(cleanCheques([{ bankName: 'A', chequeNumber: '1', amount: -5 }]).error).toMatch(/amount/);
  });
});

describe('guarantor cheques', () => {
  it('reads one cheque per line with an optional amount', () => {
    const rows = guarantorCheques({
      chequesSubmitted: 'Yes',
      chequeBank: 'Access Bank',
      chequeNumbers: '00012345 - 50,000\n00012346\n',
    });
    expect(rows).toEqual([
      { bankName: 'Access Bank', chequeNumber: '00012345', amount: '50000', chequeDate: '' },
      { bankName: 'Access Bank', chequeNumber: '00012346', amount: '', chequeDate: '' },
    ]);
  });

  it('reads none when the guarantor said No', () => {
    expect(guarantorCheques({ chequesSubmitted: 'No', chequeNumbers: '1' })).toEqual([]);
  });

  it('adds the cheque questions to an older guarantor form, before the declaration', () => {
    const old: FormQuestion[] = [
      { id: 'firstName', type: 'SHORT_TEXT', label: 'First name', required: true },
      { id: 'd', type: 'CHECKBOXES', label: 'Declaration', required: true, options: ['I agree'] },
    ];
    const ids = withGuarantorCheques('GUARANTOR', old).map((q) => q.id);
    expect(ids).toEqual(['firstName', 'chequesSubmitted', 'chequeBank', 'chequeNumbers', 'd']);
    expect(withGuarantorCheques('LOAN_APPLICATION', old)).toBe(old);
  });

  it('puts them on new guarantor forms once', () => {
    const qs = customerFormTemplate('GUARANTOR');
    expect(qs.filter((q) => q.id === 'chequeNumbers')).toHaveLength(1);
    expect(withGuarantorCheques('GUARANTOR', qs)).toBe(qs);
  });
});
