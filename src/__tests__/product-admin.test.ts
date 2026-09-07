/**
 * Product administration: the guards that stop a live product being rewritten
 * under the contracts already booked against it.
 *
 * Once loans exist on a loan product, the terms baked into their schedules
 * (rate, interest type, tenure band, processing fee) must be frozen — editing
 * them would silently reprice issued contracts. Fixed-deposit rate bands have
 * the parallel rule: overlapping bands make rate lookup ambiguous, so they are
 * refused outright.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dec, sessionUser } from './helpers/fixtures';

const h = vi.hoisted(() => {
  const state = {
    user: null as any,
    permissionError: null as string | null,
    products: [] as any[],
    openLoanCount: 0,
    accounts: [] as any[],
    rateBands: [] as any[],
    productCreates: [] as any[],
    productUpdates: [] as any[],
    rateCreates: [] as any[],
    rateUpdates: [] as any[],
  };
  return { state };
});

vi.mock('@/lib/prisma', () => {
  const { state } = h;
  return {
    prisma: {
      loanProduct: {
        findMany: vi.fn(async () => state.products),
        findUnique: vi.fn(async (args: any) => {
          if (args.where.id) return state.products.find((p) => p.id === args.where.id) ?? null;
          if (args.where.code) return state.products.find((p) => p.code === args.where.code) ?? null;
          return null;
        }),
        create: vi.fn(async (args: any) => {
          state.productCreates.push(args.data);
          return { id: 'lp-new', ...args.data };
        }),
        update: vi.fn(async (args: any) => {
          state.productUpdates.push({ id: args.where.id, ...args.data });
          return args.data;
        }),
      },
      loan: { count: vi.fn(async () => state.openLoanCount) },
      chartOfAccounts: {
        findMany: vi.fn(async (args: any) => {
          const ids: string[] | undefined = args?.where?.id?.in;
          if (!ids) return state.accounts;
          return state.accounts.filter((a) => ids.includes(a.id));
        }),
        findUnique: vi.fn(async (args: any) =>
          state.accounts.find((a) => a.accountCode === args.where.accountCode) ?? null
        ),
      },
      fixedDepositRate: {
        // Mirror the tenure-overlap predicate the action actually issues, so a
        // disjoint window is filtered out in the mock exactly as it would be in
        // the database rather than being handed back for the caller to reject.
        findMany: vi.fn(async (args: any) => {
          const where = args?.where ?? {};
          const excludeId = where.id?.not;
          const maxTenureCeiling = where.minTenure?.lte;
          const minTenureFloor = where.maxTenure?.gte;

          return state.rateBands.filter((b) => {
            if (excludeId && b.id === excludeId) return false;
            if (where.isActive !== undefined && b.isActive !== where.isActive) return false;
            if (maxTenureCeiling !== undefined && b.minTenure > maxTenureCeiling) return false;
            if (minTenureFloor !== undefined && b.maxTenure < minTenureFloor) return false;
            return true;
          });
        }),
        findUnique: vi.fn(async (args: any) =>
          state.rateBands.find((b) => b.id === args.where.id) ?? null
        ),
        create: vi.fn(async (args: any) => {
          state.rateCreates.push(args.data);
          return { id: 'fd-new', ...args.data };
        }),
        update: vi.fn(async (args: any) => {
          state.rateUpdates.push({ id: args.where.id, ...args.data });
          return args.data;
        }),
      },
    },
    withTransaction: vi.fn(async (fn: any) => fn({})),
  };
});

vi.mock('@/lib/auth-utils', () => {
  const { state } = h;
  const guard = async () => {
    if (state.permissionError) throw new Error(state.permissionError);
    return state.user;
  };
  return {
    requirePermission: vi.fn(guard),
    requireAnyPermission: vi.fn(guard),
    getSession: vi.fn(async () => ({ user: state.user })),
  };
});

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));

const {
  createLoanProduct,
  updateLoanProduct,
  setLoanProductActive,
  createFixedDepositRate,
  updateFixedDepositRate,
  retireFixedDepositRate,
  resolveFixedDepositRate,
} = await import('@/actions/product.actions');

function product(overrides: Record<string, any> = {}) {
  return {
    id: 'lp-1',
    code: 'SME_LOAN',
    name: 'SME Loan',
    description: null,
    minAmount: dec(50_000),
    maxAmount: dec(5_000_000),
    minTenure: 3,
    maxTenure: 24,
    interestRate: dec(24),
    interestType: 'REDUCING_BALANCE',
    processingFee: dec(2),
    insuranceFee: null,
    lateFee: null,
    gracePeriodDays: 0,
    penaltyRate: null,
    requiresCollateral: false,
    requiresGuarantor: false,
    loanReceivableAccountId: null,
    interestIncomeAccountId: null,
    feeIncomeAccountId: null,
    isActive: true,
    createdAt: new Date(),
    _count: { loans: 0 },
    ...overrides,
  };
}

function band(overrides: Record<string, any> = {}) {
  return {
    id: 'fd-1',
    minTenure: 30,
    maxTenure: 90,
    minAmount: dec(100_000),
    maxAmount: null,
    interestRate: dec(12),
    isActive: true,
    effectiveFrom: new Date(2020, 0, 1),
    effectiveTo: null,
    ...overrides,
  };
}

const VALID_PRODUCT = {
  code: 'ASSET_FINANCE',
  name: 'Asset Finance',
  minAmount: 100_000,
  maxAmount: 10_000_000,
  minTenure: 6,
  maxTenure: 36,
  interestRate: 20,
  interestType: 'FLAT' as const,
  processingFee: 1.5,
};

beforeEach(() => {
  h.state.permissionError = null;
  h.state.user = sessionUser({ permissions: ['SYSTEM:CONFIG_MANAGE'] });
  h.state.products = [];
  h.state.openLoanCount = 0;
  h.state.accounts = [
    { id: 'acc-1', accountCode: '1310', accountName: 'Loans Receivable', isActive: true, isHeader: false, accountType: 'ASSET' },
    { id: 'acc-2', accountCode: '1300', accountName: 'Loan Portfolio', isActive: true, isHeader: true, accountType: 'ASSET' },
    { id: 'acc-3', accountCode: '9999', accountName: 'Retired', isActive: false, isHeader: false, accountType: 'ASSET' },
  ];
  h.state.rateBands = [];
  h.state.productCreates = [];
  h.state.productUpdates = [];
  h.state.rateCreates = [];
  h.state.rateUpdates = [];
});

// ============================================================================
// LOAN PRODUCTS
// ============================================================================

describe('createLoanProduct', () => {
  it('creates a well-formed product and normalises the code', async () => {
    const result = await createLoanProduct({ ...VALID_PRODUCT, code: 'asset finance' });

    expect(result.success).toBe(true);
    expect(h.state.productCreates[0].code).toBe('ASSET_FINANCE');
  });

  it('refuses a duplicate code', async () => {
    h.state.products = [product({ code: 'ASSET_FINANCE' })];

    const result = await createLoanProduct(VALID_PRODUCT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already in use/i);
  });

  it('refuses a maximum amount below the minimum', async () => {
    const result = await createLoanProduct({
      ...VALID_PRODUCT,
      minAmount: 1_000_000,
      maxAmount: 500_000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/maximum amount/i);
  });

  it('refuses a maximum tenure below the minimum', async () => {
    const result = await createLoanProduct({ ...VALID_PRODUCT, minTenure: 24, maxTenure: 6 });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/maximum tenure/i);
  });

  it('refuses a zero interest rate', async () => {
    const result = await createLoanProduct({ ...VALID_PRODUCT, interestRate: 0 });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/interest rate/i);
  });

  it('refuses a processing fee above 100 percent', async () => {
    const result = await createLoanProduct({ ...VALID_PRODUCT, processingFee: 150 });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/processing fee/i);
  });

  it('refuses a GL account that does not exist', async () => {
    const result = await createLoanProduct({
      ...VALID_PRODUCT,
      loanReceivableAccountId: 'acc-missing',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/could not be found/i);
  });

  it('refuses an inactive GL account', async () => {
    const result = await createLoanProduct({
      ...VALID_PRODUCT,
      loanReceivableAccountId: 'acc-3',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/inactive/i);
  });

  it('refuses a header GL account, which cannot be posted to', async () => {
    const result = await createLoanProduct({
      ...VALID_PRODUCT,
      loanReceivableAccountId: 'acc-2',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/header account/i);
  });

  it('accepts a postable GL account', async () => {
    const result = await createLoanProduct({
      ...VALID_PRODUCT,
      loanReceivableAccountId: 'acc-1',
    });

    expect(result.success).toBe(true);
    expect(h.state.productCreates[0].loanReceivableAccountId).toBe('acc-1');
  });
});

describe('updateLoanProduct', () => {
  it('allows editing descriptive fields on an unused product', async () => {
    h.state.products = [product()];

    const result = await updateLoanProduct('lp-1', { name: 'SME Growth Loan' });

    expect(result.success).toBe(true);
    expect(h.state.productUpdates[0].name).toBe('SME Growth Loan');
  });

  it('allows editing contract terms while no loans exist', async () => {
    h.state.products = [product({ _count: { loans: 0 } })];

    const result = await updateLoanProduct('lp-1', { interestRate: 18 });

    expect(result.success).toBe(true);
  });

  it('freezes the interest rate once loans have been booked', async () => {
    h.state.products = [product({ _count: { loans: 12 } })];

    const result = await updateLoanProduct('lp-1', { interestRate: 18 });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/interestRate/);
    expect(result.error).toMatch(/12 loan/);
    expect(h.state.productUpdates).toHaveLength(0);
  });

  it('freezes the interest type once loans have been booked', async () => {
    h.state.products = [product({ _count: { loans: 3 } })];

    const result = await updateLoanProduct('lp-1', { interestType: 'FLAT' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/interestType/);
  });

  it('freezes the tenure band once loans have been booked', async () => {
    h.state.products = [product({ _count: { loans: 3 } })];

    const result = await updateLoanProduct('lp-1', { maxTenure: 60 });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/maxTenure/);
  });

  it('still allows editing the name and amount band on a used product', async () => {
    h.state.products = [product({ _count: { loans: 3 } })];

    const result = await updateLoanProduct('lp-1', {
      name: 'Renamed',
      maxAmount: 8_000_000,
    });

    expect(result.success).toBe(true);
    expect(h.state.productUpdates[0].name).toBe('Renamed');
  });

  it('reports a missing product rather than throwing', async () => {
    const result = await updateLoanProduct('nope', { name: 'X' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('refuses an update with no changes', async () => {
    h.state.products = [product()];

    const result = await updateLoanProduct('lp-1', {});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no changes/i);
  });
});

describe('setLoanProductActive', () => {
  it('refuses to deactivate a product with open loans on it', async () => {
    h.state.products = [product()];
    h.state.openLoanCount = 5;

    const result = await setLoanProductActive('lp-1', false);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/5 loan\(s\) on this product are still open/i);
  });

  it('allows deactivating a product with no open loans', async () => {
    h.state.products = [product()];
    h.state.openLoanCount = 0;

    const result = await setLoanProductActive('lp-1', false);

    expect(result.success).toBe(true);
  });

  it('refuses a no-op toggle', async () => {
    h.state.products = [product({ isActive: true })];

    const result = await setLoanProductActive('lp-1', true);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already active/i);
  });

  it('reactivates without checking open loans', async () => {
    h.state.products = [product({ isActive: false })];
    h.state.openLoanCount = 5;

    const result = await setLoanProductActive('lp-1', true);

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// FIXED DEPOSIT RATE BANDS
// ============================================================================

describe('createFixedDepositRate', () => {
  it('creates a band when nothing overlaps', async () => {
    const result = await createFixedDepositRate({
      minTenure: 30,
      maxTenure: 90,
      minAmount: 100_000,
      interestRate: 12,
    });

    expect(result.success).toBe(true);
    expect(h.state.rateCreates).toHaveLength(1);
  });

  it('refuses a band overlapping an existing one on tenure and amount', async () => {
    h.state.rateBands = [band()];

    const result = await createFixedDepositRate({
      minTenure: 60,
      maxTenure: 120,
      minAmount: 200_000,
      interestRate: 14,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/overlaps an existing band/i);
    expect(h.state.rateCreates).toHaveLength(0);
  });

  it('allows a band that overlaps on tenure but not on amount', async () => {
    // Existing band covers 100,000 up to 500,000
    h.state.rateBands = [band({ maxAmount: dec(500_000) })];

    const result = await createFixedDepositRate({
      minTenure: 60,
      maxTenure: 120,
      minAmount: 600_000,
      interestRate: 14,
    });

    expect(result.success).toBe(true);
  });

  it('allows a band in a disjoint tenure window', async () => {
    h.state.rateBands = [band()]; // 30-90 days

    const result = await createFixedDepositRate({
      minTenure: 91,
      maxTenure: 180,
      minAmount: 100_000,
      interestRate: 14,
    });

    expect(result.success).toBe(true);
  });

  it('refuses a maximum tenure below the minimum', async () => {
    const result = await createFixedDepositRate({
      minTenure: 180,
      maxTenure: 30,
      minAmount: 100_000,
      interestRate: 12,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/maximum tenure/i);
  });

  it('refuses a tenure beyond ten years', async () => {
    const result = await createFixedDepositRate({
      minTenure: 30,
      maxTenure: 4000,
      minAmount: 100_000,
      interestRate: 12,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/3650 days/i);
  });

  it('refuses a rate outside 0-100', async () => {
    const result = await createFixedDepositRate({
      minTenure: 30,
      maxTenure: 90,
      minAmount: 100_000,
      interestRate: 0,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/interest rate/i);
  });
});

describe('updateFixedDepositRate', () => {
  it('updates a band in place', async () => {
    h.state.rateBands = [band()];

    const result = await updateFixedDepositRate('fd-1', { interestRate: 13.5 });

    expect(result.success).toBe(true);
    expect(h.state.rateUpdates[0].interestRate).toBe(13.5);
  });

  it('excludes the band being edited from the overlap check', async () => {
    h.state.rateBands = [band()];

    // Widening its own window must not clash with itself
    const result = await updateFixedDepositRate('fd-1', { maxTenure: 120 });

    expect(result.success).toBe(true);
  });

  it('refuses an edit that would overlap another band', async () => {
    h.state.rateBands = [
      band(),
      band({ id: 'fd-2', minTenure: 91, maxTenure: 180, interestRate: dec(14) }),
    ];

    const result = await updateFixedDepositRate('fd-1', { maxTenure: 120 });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/would overlap/i);
  });
});

describe('retireFixedDepositRate', () => {
  it('retires an active band rather than deleting it', async () => {
    h.state.rateBands = [band()];

    const result = await retireFixedDepositRate('fd-1');

    expect(result.success).toBe(true);
    expect(h.state.rateUpdates[0].isActive).toBe(false);
    expect(h.state.rateUpdates[0].effectiveTo).toBeInstanceOf(Date);
  });

  it('refuses to retire a band twice', async () => {
    h.state.rateBands = [band({ isActive: false })];

    const result = await retireFixedDepositRate('fd-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already retired/i);
  });
});

describe('resolveFixedDepositRate', () => {
  it('returns the rate for a matching band', async () => {
    h.state.rateBands = [band()];

    const result = await resolveFixedDepositRate(60, 500_000);

    expect(result.success).toBe(true);
    expect(result.data?.interestRate).toBe(12);
  });

  it('reports clearly when no band covers the request', async () => {
    h.state.rateBands = [];

    const result = await resolveFixedDepositRate(60, 500_000);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no rate band covers/i);
  });

  it('prefers the narrowest tenure window when several match', async () => {
    h.state.rateBands = [
      band({ id: 'wide', minTenure: 1, maxTenure: 365, interestRate: dec(8) }),
      band({ id: 'narrow', minTenure: 55, maxTenure: 65, interestRate: dec(15) }),
    ];

    const result = await resolveFixedDepositRate(60, 500_000);

    expect(result.success).toBe(true);
    expect(result.data?.bandId).toBe('narrow');
    expect(result.data?.interestRate).toBe(15);
  });

  it('excludes a band whose amount ceiling is below the deposit', async () => {
    h.state.rateBands = [band({ maxAmount: dec(200_000) })];

    const result = await resolveFixedDepositRate(60, 500_000);

    expect(result.success).toBe(false);
  });
});
