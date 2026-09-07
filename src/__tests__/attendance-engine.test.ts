/**
 * Attendance engine: shift resolution, lateness and overtime.
 *
 * Lateness is a disciplinary and payroll input, so the grace period must be
 * honoured exactly — one minute inside the grace is on time, one minute past it
 * is late, and the recorded minutes are measured from the shift start, not from
 * the end of the grace window.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state = {
    assignment: null as any,
    defaultShift: null as any,
    holiday: null as any,
    config: {} as Record<string, string>,
  };
  return { state };
});

vi.mock('@/lib/prisma', () => {
  const { state } = h;
  return {
    prisma: {
      shiftAssignment: { findFirst: vi.fn(async () => state.assignment) },
      workShift: { findFirst: vi.fn(async () => state.defaultShift) },
      holiday: { findFirst: vi.fn(async () => state.holiday) },
    },
  };
});

vi.mock('@/lib/system-config', () => {
  const { state } = h;
  return {
    getConfigMany: vi.fn(async (keys: string[]) => {
      const out: Record<string, string> = {};
      for (const key of keys) out[key] = state.config[key] ?? '';
      return out;
    }),
  };
});

const { resolveShift, assessClockIn, assessClockOut, isWorkingDay, applyTimeToDate } =
  await import('@/lib/attendance-engine');

function shift(overrides: Record<string, any> = {}) {
  return {
    id: 'shift-1',
    code: 'STANDARD',
    name: 'Standard Day Shift',
    startTime: '08:00',
    endTime: '17:00',
    graceMinutes: 15,
    breakMinutes: 60,
    workDays: [1, 2, 3, 4, 5],
    isActive: true,
    ...overrides,
  };
}

/** Build a Date on 7 September 2026 (a Monday) at a given local time. */
function at(hours: number, minutes: number): Date {
  return new Date(2026, 8, 7, hours, minutes, 0, 0);
}

const DAY = new Date(2026, 8, 7);

beforeEach(() => {
  h.state.assignment = null;
  h.state.defaultShift = null;
  h.state.holiday = null;
  h.state.config = {
    'hr.workdayStart': '09:00',
    'hr.workdayEnd': '17:00',
    'hr.lateGraceMinutes': '15',
    'hr.workDays': '[1,2,3,4,5]',
    'hr.overtimeThresholdMinutes': '30',
  };
});

// ============================================================================
// SHIFT RESOLUTION
// ============================================================================

describe('resolveShift', () => {
  it('prefers the staff assigned shift', async () => {
    h.state.assignment = { shift: shift({ name: 'Late Shift', startTime: '12:00' }) };
    h.state.defaultShift = shift({ name: 'Default' });

    const resolved = await resolveShift('staff-1', DAY);

    expect(resolved.shiftName).toBe('Late Shift');
    expect(resolved.startTime).toBe('12:00');
  });

  it('falls back to the default shift when none is assigned', async () => {
    h.state.defaultShift = shift({ name: 'Company Default', startTime: '07:30' });

    const resolved = await resolveShift('staff-1', DAY);

    expect(resolved.shiftName).toBe('Company Default');
    expect(resolved.startTime).toBe('07:30');
  });

  it('falls back to system configuration when no shift exists at all', async () => {
    const resolved = await resolveShift('staff-1', DAY);

    expect(resolved.shiftId).toBeNull();
    expect(resolved.startTime).toBe('09:00');
    expect(resolved.endTime).toBe('17:00');
    expect(resolved.graceMinutes).toBe(15);
    expect(resolved.workDays).toEqual([1, 2, 3, 4, 5]);
  });

  it('falls back to Mon-Fri when the configured working days are malformed', async () => {
    h.state.config['hr.workDays'] = 'nonsense';

    const resolved = await resolveShift('staff-1', DAY);

    expect(resolved.workDays).toEqual([1, 2, 3, 4, 5]);
  });
});

// ============================================================================
// CLOCK IN
// ============================================================================

describe('assessClockIn', () => {
  beforeEach(() => {
    h.state.defaultShift = shift(); // 08:00 start, 15 minutes grace
  });

  it('marks an early arrival as present', async () => {
    const result = await assessClockIn('staff-1', at(7, 45));

    expect(result.status).toBe('PRESENT');
    expect(result.minutesLate).toBe(0);
  });

  it('marks an arrival exactly on the shift start as present', async () => {
    const result = await assessClockIn('staff-1', at(8, 0));

    expect(result.status).toBe('PRESENT');
    expect(result.minutesLate).toBe(0);
  });

  it('treats an arrival inside the grace period as present', async () => {
    const result = await assessClockIn('staff-1', at(8, 14));

    expect(result.status).toBe('PRESENT');
    expect(result.minutesLate).toBe(0);
  });

  it('treats an arrival on the last minute of grace as present', async () => {
    const result = await assessClockIn('staff-1', at(8, 15));

    expect(result.status).toBe('PRESENT');
  });

  it('marks an arrival one minute past grace as late', async () => {
    const result = await assessClockIn('staff-1', at(8, 16));

    expect(result.status).toBe('LATE');
    // Measured from the shift start, not from the end of grace
    expect(result.minutesLate).toBe(16);
  });

  it('measures lateness from the shift start for a very late arrival', async () => {
    const result = await assessClockIn('staff-1', at(10, 30));

    expect(result.status).toBe('LATE');
    expect(result.minutesLate).toBe(150);
  });

  it('honours a shift with no grace period', async () => {
    h.state.defaultShift = shift({ graceMinutes: 0 });

    const onTime = await assessClockIn('staff-1', at(8, 0));
    const late = await assessClockIn('staff-1', at(8, 1));

    expect(onTime.status).toBe('PRESENT');
    expect(late.status).toBe('LATE');
    expect(late.minutesLate).toBe(1);
  });

  it('reports the shift it judged against', async () => {
    const result = await assessClockIn('staff-1', at(8, 30));

    expect(result.shift.shiftName).toBe('Standard Day Shift');
    expect(result.expectedStart.getHours()).toBe(8);
  });
});

// ============================================================================
// CLOCK OUT
// ============================================================================

describe('assessClockOut', () => {
  beforeEach(() => {
    h.state.defaultShift = shift(); // 08:00-17:00, 60-minute break
  });

  it('subtracts the unpaid break from a full day', async () => {
    // 08:00 to 17:00 is 540 minutes gross, minus a 60-minute break
    const result = await assessClockOut('staff-1', at(8, 0), at(17, 0));

    expect(result.workedMinutes).toBe(480);
    expect(result.hoursWorked).toBe(8);
  });

  it('does not subtract a break longer than the time actually worked', async () => {
    // A 30-minute visit must not come out as negative worked time
    const result = await assessClockOut('staff-1', at(8, 0), at(8, 30));

    expect(result.workedMinutes).toBe(30);
  });

  it('records no overtime when leaving within the threshold', async () => {
    // 20 minutes past the 17:00 end, under the 30-minute threshold
    const result = await assessClockOut('staff-1', at(8, 0), at(17, 20));

    expect(result.overtimeMinutes).toBe(0);
  });

  it('records overtime once the threshold is passed', async () => {
    const result = await assessClockOut('staff-1', at(8, 0), at(18, 0));

    expect(result.overtimeMinutes).toBe(60);
  });

  it('flags an early departure', async () => {
    const result = await assessClockOut('staff-1', at(8, 0), at(15, 0));

    expect(result.leftEarly).toBe(true);
    expect(result.overtimeMinutes).toBe(0);
  });

  it('does not flag an early departure when leaving on time', async () => {
    const result = await assessClockOut('staff-1', at(8, 0), at(17, 0));

    expect(result.leftEarly).toBe(false);
  });

  it('never returns negative worked time for an inverted pair', async () => {
    const result = await assessClockOut('staff-1', at(17, 0), at(8, 0));

    expect(result.workedMinutes).toBe(0);
    expect(result.hoursWorked).toBe(0);
  });
});

// ============================================================================
// WORKING DAY
// ============================================================================

describe('isWorkingDay', () => {
  beforeEach(() => {
    h.state.defaultShift = shift();
  });

  it('accepts a day inside the shift working days', async () => {
    // 7 September 2026 is a Monday
    expect(await isWorkingDay('staff-1', new Date(2026, 8, 7))).toBe(true);
  });

  it('rejects a day outside the shift working days', async () => {
    // 12 September 2026 is a Saturday
    expect(await isWorkingDay('staff-1', new Date(2026, 8, 12))).toBe(false);
  });

  it('rejects a working day that is a holiday', async () => {
    h.state.holiday = { id: 'hol-1', name: 'Independence Day' };

    expect(await isWorkingDay('staff-1', new Date(2026, 8, 7))).toBe(false);
  });
});

// ============================================================================
// TIME HELPERS
// ============================================================================

describe('applyTimeToDate', () => {
  it('applies a well-formed time to the given day', () => {
    const result = applyTimeToDate(new Date(2026, 8, 7), '14:45', 9);

    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(45);
    expect(result.getDate()).toBe(7);
  });

  it('falls back to the supplied hour when the time is malformed', () => {
    const result = applyTimeToDate(new Date(2026, 8, 7), 'noon', 9);

    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
  });

  it('does not mutate the date it was given', () => {
    const original = new Date(2026, 8, 7, 3, 0, 0, 0);
    applyTimeToDate(original, '14:45', 9);

    expect(original.getHours()).toBe(3);
  });
});
