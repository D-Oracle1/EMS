/**
 * Forms — questions, answers and the rules between them.
 *
 * A form is a list of questions stored as JSON on the Form row. Each question
 * has a stable id, and a response stores its answers keyed by that id, so a
 * question can be reworded or moved without orphaning what people said.
 *
 * Everything here is pure: the builder, the public page and the server all
 * run the same validation, and it is testable without a database.
 */
import type { SessionUser } from '@/types';

export const QUESTION_TYPES = [
  'SHORT_TEXT',
  'PARAGRAPH',
  'MULTIPLE_CHOICE',
  'CHECKBOXES',
  'DROPDOWN',
  'NUMBER',
  'EMAIL',
  'PHONE',
  'DATE',
  'SCALE',
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  SHORT_TEXT: 'Short answer',
  PARAGRAPH: 'Paragraph',
  MULTIPLE_CHOICE: 'Multiple choice',
  CHECKBOXES: 'Checkboxes',
  DROPDOWN: 'Dropdown',
  NUMBER: 'Number',
  EMAIL: 'Email',
  PHONE: 'Phone number',
  DATE: 'Date',
  SCALE: 'Linear scale',
};

export interface FormQuestion {
  id: string;
  type: QuestionType;
  label: string;
  help?: string;
  required: boolean;
  /** MULTIPLE_CHOICE, CHECKBOXES, DROPDOWN. */
  options?: string[];
  /** SCALE: 0 or 1 to 2..10. */
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
}

export type Answer = string | string[] | number;
export type Answers = Record<string, Answer>;

export const LIMITS = {
  title: 150,
  description: 2000,
  questions: 100,
  label: 300,
  help: 500,
  options: 50,
  option: 200,
  shortText: 500,
  paragraph: 5000,
  confirmation: 1000,
};

/** Who builds forms and reads their responses: the superuser and level 85+. */
export const FORM_MANAGER_ROLE_LEVEL = 85;

export function canManageForms(user: Pick<SessionUser, 'permissions' | 'roleLevel'>): boolean {
  return user.permissions.includes('ADMIN:SYSTEM') || (user.roleLevel ?? 0) >= FORM_MANAGER_ROLE_LEVEL;
}

export const hasOptions = (type: QuestionType) =>
  type === 'MULTIPLE_CHOICE' || type === 'CHECKBOXES' || type === 'DROPDOWN';

export function newQuestionId(): string {
  return `q_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function blankQuestion(type: QuestionType = 'SHORT_TEXT'): FormQuestion {
  return {
    id: newQuestionId(),
    type,
    label: '',
    required: false,
    ...(hasOptions(type) ? { options: ['Option 1'] } : {}),
    ...(type === 'SCALE' ? { scaleMin: 1, scaleMax: 5 } : {}),
  };
}

/** A URL-safe share slug: the title's words plus a random tail, so it is unguessable. */
export function makeSlug(title: string, random: string = Math.random().toString(36).slice(2, 8)): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return base ? `${base}-${random}` : random;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Cleans a question list from the builder. Throws with a message a person can
 * act on when the form cannot be saved as it stands.
 */
export function normalizeQuestions(input: unknown): FormQuestion[] {
  if (!Array.isArray(input)) throw new Error('The questions are not in a list');
  if (input.length > LIMITS.questions) throw new Error(`A form can hold at most ${LIMITS.questions} questions`);

  const seen = new Set<string>();
  return input.map((raw, index) => {
    const q = (raw ?? {}) as Record<string, unknown>;
    const n = index + 1;
    const type = q.type as QuestionType;
    if (!QUESTION_TYPES.includes(type)) throw new Error(`Question ${n} has an unknown type`);

    const label = str(q.label, LIMITS.label);
    if (!label) throw new Error(`Question ${n} needs a question`);

    let id = str(q.id, 40);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || seen.has(id)) id = newQuestionId();
    seen.add(id);

    const question: FormQuestion = { id, type, label, required: q.required === true };
    const help = str(q.help, LIMITS.help);
    if (help) question.help = help;

    if (hasOptions(type)) {
      const options = Array.isArray(q.options)
        ? Array.from(new Set(q.options.map((o) => str(o, LIMITS.option)).filter(Boolean)))
        : [];
      if (options.length === 0) throw new Error(`Question ${n} needs at least one option`);
      if (options.length > LIMITS.options) throw new Error(`Question ${n} has more than ${LIMITS.options} options`);
      question.options = options;
    }

    if (type === 'SCALE') {
      const min = q.scaleMin === 0 ? 0 : 1;
      const max = Math.round(Number(q.scaleMax));
      if (!Number.isFinite(max) || max < 2 || max > 10) throw new Error(`Question ${n}: the scale must end between 2 and 10`);
      question.scaleMin = min;
      question.scaleMax = max;
      const lo = str(q.scaleMinLabel, 60);
      const hi = str(q.scaleMaxLabel, 60);
      if (lo) question.scaleMinLabel = lo;
      if (hi) question.scaleMaxLabel = hi;
    }

    return question;
  });
}

/** Reads the stored JSON back as questions, dropping anything malformed. */
export function readQuestions(value: unknown): FormQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (q): q is FormQuestion =>
      !!q && typeof q === 'object' && typeof q.id === 'string' && QUESTION_TYPES.includes(q.type) && typeof q.label === 'string'
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks a submission against the form. Returns the cleaned answers (only the
 * form's own questions, trimmed, typed) or a message per failing question id.
 */
export function validateAnswers(
  questions: FormQuestion[],
  input: unknown
): { ok: true; answers: Answers } | { ok: false; errors: Record<string, string> } {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const answers: Answers = {};
  const errors: Record<string, string> = {};

  for (const q of questions) {
    const value = raw[q.id];
    const empty =
      value == null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0);

    if (empty) {
      if (q.required) errors[q.id] = 'This question is required';
      continue;
    }

    switch (q.type) {
      case 'SHORT_TEXT':
      case 'PARAGRAPH': {
        if (typeof value !== 'string') { errors[q.id] = 'Enter text'; break; }
        const max = q.type === 'SHORT_TEXT' ? LIMITS.shortText : LIMITS.paragraph;
        if (value.trim().length > max) { errors[q.id] = `Keep this under ${max} characters`; break; }
        answers[q.id] = value.trim();
        break;
      }
      case 'EMAIL': {
        const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
        if (!EMAIL.test(v) || v.length > 160) { errors[q.id] = 'Enter a valid email address'; break; }
        answers[q.id] = v;
        break;
      }
      case 'PHONE': {
        const v = typeof value === 'string' ? value.trim() : '';
        const digits = v.replace(/\D/g, '');
        if (digits.length < 7 || digits.length > 15 || !/^[+\d\s()-]+$/.test(v)) {
          errors[q.id] = 'Enter a valid phone number';
          break;
        }
        answers[q.id] = v;
        break;
      }
      case 'NUMBER': {
        const v = typeof value === 'number' ? value : Number(String(value).trim());
        if (!Number.isFinite(v)) { errors[q.id] = 'Enter a number'; break; }
        answers[q.id] = v;
        break;
      }
      case 'DATE': {
        const v = typeof value === 'string' ? value.trim() : '';
        if (!DATE.test(v) || Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())) {
          errors[q.id] = 'Enter a valid date';
          break;
        }
        answers[q.id] = v;
        break;
      }
      case 'MULTIPLE_CHOICE':
      case 'DROPDOWN': {
        if (typeof value !== 'string' || !(q.options ?? []).includes(value)) {
          errors[q.id] = 'Choose one of the options';
          break;
        }
        answers[q.id] = value;
        break;
      }
      case 'CHECKBOXES': {
        const list = Array.isArray(value) ? value : [value];
        const options = q.options ?? [];
        if (!list.every((v) => typeof v === 'string' && options.includes(v))) {
          errors[q.id] = 'Choose from the options';
          break;
        }
        // Stored in the form's own option order, without repeats.
        answers[q.id] = options.filter((o) => list.includes(o));
        break;
      }
      case 'SCALE': {
        const v = typeof value === 'number' ? value : Number(value);
        const min = q.scaleMin ?? 1;
        const max = q.scaleMax ?? 5;
        if (!Number.isInteger(v) || v < min || v > max) { errors[q.id] = `Choose from ${min} to ${max}`; break; }
        answers[q.id] = v;
        break;
      }
    }
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers };
}

/** Whether a form takes responses right now. */
export function isAcceptingResponses(form: { status: string; closesAt: Date | string | null }, now = new Date()): boolean {
  if (form.status !== 'OPEN') return false;
  return !form.closesAt || new Date(form.closesAt).getTime() > now.getTime();
}

/** One answer as plain text, for tables and CSV. */
export function answerText(value: Answer | undefined): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

export type QuestionSummary =
  | { kind: 'choices'; answered: number; counts: { option: string; count: number }[] }
  | { kind: 'scale'; answered: number; average: number | null; counts: { option: string; count: number }[] }
  | { kind: 'number'; answered: number; average: number | null; min: number | null; max: number | null }
  | { kind: 'text'; answered: number; latest: string[] };

/** Per-question roll-up for the responses page. */
export function summarize(question: FormQuestion, responses: Answers[], latestCount = 10): QuestionSummary {
  const values = responses.map((r) => r[question.id]).filter((v) => v != null && answerText(v) !== '');
  const answered = values.length;

  if (hasOptions(question.type)) {
    const options = question.options ?? [];
    const tally = new Map<string, number>(options.map((o) => [o, 0]));
    for (const v of values) {
      for (const choice of Array.isArray(v) ? v : [String(v)]) {
        tally.set(choice, (tally.get(choice) ?? 0) + 1);
      }
    }
    return { kind: 'choices', answered, counts: Array.from(tally, ([option, count]) => ({ option, count })) };
  }

  if (question.type === 'SCALE') {
    const min = question.scaleMin ?? 1;
    const max = question.scaleMax ?? 5;
    const nums = values.map(Number).filter(Number.isFinite);
    const counts = [];
    for (let i = min; i <= max; i++) counts.push({ option: String(i), count: nums.filter((n) => n === i).length });
    const average = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    return { kind: 'scale', answered, average, counts };
  }

  if (question.type === 'NUMBER') {
    const nums = values.map(Number).filter(Number.isFinite);
    return {
      kind: 'number',
      answered,
      average: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
      min: nums.length ? Math.min(...nums) : null,
      max: nums.length ? Math.max(...nums) : null,
    };
  }

  return { kind: 'text', answered, latest: values.slice(0, latestCount).map((v) => answerText(v)) };
}

function csvCell(value: string): string {
  // A leading =, +, - or @ makes a spreadsheet run the cell as a formula.
  // Plain numbers (a negative answer to a number question) are left alone.
  const formula = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value);
  const safe = formula ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The responses as CSV: one row each, one column per question. */
export function responsesCsv(
  questions: FormQuestion[],
  responses: { submittedAt: Date | string; respondent: string | null; answers: Answers }[]
): string {
  const header = ['Submitted', 'Respondent', ...questions.map((q) => q.label)];
  const rows = responses.map((r) => [
    new Date(r.submittedAt).toISOString(),
    r.respondent ?? 'Anonymous',
    ...questions.map((q) => answerText(r.answers[q.id])),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
