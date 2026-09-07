/**
 * System configuration: typed accessors, validation and the default fallback.
 *
 * The registry is the source of truth — a stored row only ever *overrides* a
 * declared default. These tests pin down that a missing table, a malformed
 * value, or an unknown key can never take a request down, and that validation
 * refuses anything the typed accessors would then misread.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state = {
    rows: [] as any[],
    throwOnRead: false,
    upserts: [] as any[],
    deletes: [] as any[],
  };
  return { state };
});

vi.mock('@/lib/prisma', () => {
  const { state } = h;
  return {
    prisma: {
      systemConfig: {
        findMany: vi.fn(async () => {
          if (state.throwOnRead) throw new Error('database unreachable');
          return state.rows;
        }),
        upsert: vi.fn(async (args: any) => {
          state.upserts.push(args);
          return args.create;
        }),
        deleteMany: vi.fn(async (args: any) => {
          state.deletes.push(args);
          return { count: 1 };
        }),
      },
    },
  };
});

const {
  getConfig,
  getConfigNumber,
  getConfigBoolean,
  getConfigTime,
  getConfigJson,
  getConfigMany,
  validateConfigValue,
  listEffectiveConfig,
  setConfigValue,
  resetConfigValue,
  invalidateConfigCache,
  getDefinition,
  CONFIG_DEFINITIONS,
} = await import('@/lib/system-config');

beforeEach(() => {
  h.state.rows = [];
  h.state.throwOnRead = false;
  h.state.upserts = [];
  h.state.deletes = [];
  invalidateConfigCache();
});

// ============================================================================
// REGISTRY
// ============================================================================

describe('CONFIG_DEFINITIONS', () => {
  it('declares unique keys', () => {
    const keys = CONFIG_DEFINITIONS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every setting a label, description and category', () => {
    for (const definition of CONFIG_DEFINITIONS) {
      expect(definition.label.length).toBeGreaterThan(0);
      expect(definition.description.length).toBeGreaterThan(0);
      expect(definition.category.length).toBeGreaterThan(0);
    }
  });

  it('declares defaults that pass their own validation', () => {
    for (const definition of CONFIG_DEFINITIONS) {
      // An empty string is a legitimate "not set yet" default for free text.
      if (definition.dataType === 'STRING' && definition.defaultValue === '') continue;
      const result = validateConfigValue(definition.key, definition.defaultValue);
      expect(result.ok, `${definition.key} default failed validation`).toBe(true);
    }
  });
});

// ============================================================================
// ACCESSORS
// ============================================================================

describe('typed accessors', () => {
  it('returns the registry default when nothing is stored', async () => {
    expect(await getConfig('company.name')).toBe('Hylink Finance Limited');
  });

  it('returns a stored override in place of the default', async () => {
    h.state.rows = [{ key: 'company.name', value: 'Acme Microfinance' }];
    expect(await getConfig('company.name')).toBe('Acme Microfinance');
  });

  it('falls back to defaults when the database read fails', async () => {
    h.state.throwOnRead = true;
    // A config read must never take down the request that needed it.
    expect(await getConfig('hr.workdayStart')).toBe('09:00');
  });

  it('returns an empty string for an unknown key', async () => {
    expect(await getConfig('does.not.exist')).toBe('');
  });

  it('parses numbers', async () => {
    expect(await getConfigNumber('hr.lateGraceMinutes')).toBe(15);
  });

  it('falls back to the default when a stored number is malformed', async () => {
    h.state.rows = [{ key: 'hr.lateGraceMinutes', value: 'not-a-number' }];
    expect(await getConfigNumber('hr.lateGraceMinutes')).toBe(15);
  });

  it('parses booleans in their several written forms', async () => {
    h.state.rows = [{ key: 'ops.emailAlertsEnabled', value: 'TRUE' }];
    expect(await getConfigBoolean('ops.emailAlertsEnabled')).toBe(true);

    invalidateConfigCache();
    h.state.rows = [{ key: 'ops.emailAlertsEnabled', value: 'false' }];
    expect(await getConfigBoolean('ops.emailAlertsEnabled')).toBe(false);
  });

  it('treats any non-truthy string as false', async () => {
    h.state.rows = [{ key: 'ops.emailAlertsEnabled', value: 'maybe' }];
    expect(await getConfigBoolean('ops.emailAlertsEnabled')).toBe(false);
  });

  it('parses times into hours and minutes', async () => {
    h.state.rows = [{ key: 'hr.workdayStart', value: '08:30' }];
    expect(await getConfigTime('hr.workdayStart')).toEqual({ hours: 8, minutes: 30 });
  });

  it('falls back to 09:00 when a stored time is malformed', async () => {
    h.state.rows = [{ key: 'hr.workdayStart', value: 'lunchtime' }];
    expect(await getConfigTime('hr.workdayStart')).toEqual({ hours: 9, minutes: 0 });
  });

  it('parses JSON values', async () => {
    expect(await getConfigJson<number[]>('hr.workDays', [])).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns the supplied fallback when JSON is malformed', async () => {
    h.state.rows = [{ key: 'hr.workDays', value: '{not json' }];
    expect(await getConfigJson<number[]>('hr.workDays', [0, 6])).toEqual([0, 6]);
  });

  it('reads several keys in one pass', async () => {
    const values = await getConfigMany(['hr.workdayStart', 'hr.workdayEnd']);
    expect(values).toEqual({ 'hr.workdayStart': '09:00', 'hr.workdayEnd': '17:00' });
  });
});

// ============================================================================
// VALIDATION
// ============================================================================

describe('validateConfigValue', () => {
  it('rejects an unknown key', () => {
    const result = validateConfigValue('nope.nope', 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown configuration key/i);
  });

  it('accepts a well-formed number and normalises it', () => {
    const result = validateConfigValue('hr.lateGraceMinutes', ' 20 ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('20');
  });

  it('rejects a non-numeric value for a NUMBER setting', () => {
    const result = validateConfigValue('hr.lateGraceMinutes', 'soon');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/must be a number/i);
  });

  it('rejects a negative number', () => {
    const result = validateConfigValue('hr.lateGraceMinutes', '-5');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cannot be negative/i);
  });

  it('accepts true and false for a BOOLEAN setting', () => {
    expect(validateConfigValue('ops.emailAlertsEnabled', 'TRUE').ok).toBe(true);
    expect(validateConfigValue('ops.emailAlertsEnabled', 'false').ok).toBe(true);
  });

  it('rejects a non-boolean value for a BOOLEAN setting', () => {
    const result = validateConfigValue('ops.emailAlertsEnabled', 'yes');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/true or false/i);
  });

  it('normalises a TIME value to zero-padded HH:mm', () => {
    const result = validateConfigValue('hr.workdayStart', '8:05');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('08:05');
  });

  it('rejects a malformed time', () => {
    const result = validateConfigValue('hr.workdayStart', '0830');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/HH:mm/i);
  });

  it('rejects an out-of-range time', () => {
    const result = validateConfigValue('hr.workdayStart', '25:00');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not a valid time/i);
  });

  it('accepts valid JSON', () => {
    expect(validateConfigValue('hr.workDays', '[1,2,3]').ok).toBe(true);
  });

  it('rejects malformed JSON', () => {
    const result = validateConfigValue('hr.workDays', '[1,2,');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/valid JSON/i);
  });
});

// ============================================================================
// EFFECTIVE LIST AND WRITES
// ============================================================================

describe('listEffectiveConfig', () => {
  it('returns one row per registry entry', async () => {
    const entries = await listEffectiveConfig();
    expect(entries).toHaveLength(CONFIG_DEFINITIONS.length);
  });

  it('marks a stored value that differs from the default as overridden', async () => {
    h.state.rows = [
      { key: 'hr.lateGraceMinutes', value: '30', updatedAt: new Date() },
    ];

    const entries = await listEffectiveConfig();
    const entry = entries.find((e) => e.key === 'hr.lateGraceMinutes')!;

    expect(entry.value).toBe('30');
    expect(entry.isOverridden).toBe(true);
  });

  it('does not mark a stored value equal to the default as overridden', async () => {
    h.state.rows = [
      { key: 'hr.lateGraceMinutes', value: '15', updatedAt: new Date() },
    ];

    const entries = await listEffectiveConfig();
    const entry = entries.find((e) => e.key === 'hr.lateGraceMinutes')!;

    expect(entry.isOverridden).toBe(false);
  });
});

describe('setConfigValue', () => {
  it('rejects an unknown key', async () => {
    await expect(setConfigValue('nope.nope', '1', 'staff-1')).rejects.toThrow(
      /unknown configuration key/i
    );
  });

  it('upserts with the registry metadata attached', async () => {
    await setConfigValue('hr.lateGraceMinutes', '20', 'staff-1');

    const upsert = h.state.upserts[0];
    expect(upsert.where.key).toBe('hr.lateGraceMinutes');
    expect(upsert.update.value).toBe('20');
    expect(upsert.create.category).toBe('ATTENDANCE');
    expect(upsert.create.dataType).toBe('NUMBER');
    expect(upsert.create.updatedById).toBe('staff-1');
  });

  it('invalidates the cache so the next read sees the new value', async () => {
    // Warm the cache on the default
    expect(await getConfigNumber('hr.lateGraceMinutes')).toBe(15);

    h.state.rows = [{ key: 'hr.lateGraceMinutes', value: '45' }];
    await setConfigValue('hr.lateGraceMinutes', '45', 'staff-1');

    expect(await getConfigNumber('hr.lateGraceMinutes')).toBe(45);
  });
});

describe('resetConfigValue', () => {
  it('deletes the override and reverts to the default', async () => {
    h.state.rows = [{ key: 'hr.lateGraceMinutes', value: '45' }];
    expect(await getConfigNumber('hr.lateGraceMinutes')).toBe(45);

    h.state.rows = [];
    await resetConfigValue('hr.lateGraceMinutes');

    expect(h.state.deletes[0].where.key).toBe('hr.lateGraceMinutes');
    expect(await getConfigNumber('hr.lateGraceMinutes')).toBe(15);
  });
});

describe('getDefinition', () => {
  it('returns the declaration for a known key', () => {
    expect(getDefinition('payroll.pensionEmployeeRate')?.category).toBe('PAYROLL');
  });

  it('returns undefined for an unknown key', () => {
    expect(getDefinition('nope.nope')).toBeUndefined();
  });
});
