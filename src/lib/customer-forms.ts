/**
 * Customer application forms — savings, mutual partnership, fixed deposit,
 * loan and guarantor.
 *
 * The same idea as staff onboarding (lib/forms ONBOARDING_FIELDS): a public
 * form whose key questions carry fixed ids, so an approved response can become
 * a customer profile. People who never come into the office fill the form
 * from a link; the officer for that product reviews it, and approving it
 * profiles the customer and opens the usual "new account" screen already
 * filled in.
 *
 * A loan needs two guarantors. Submitting a loan application gives the
 * applicant a reference and a guarantor link carrying it (/f/<slug>?app=REF),
 * so each guarantor's form arrives already tied to that application.
 *
 * Pure: no database, so the builder, the public page and the server share it
 * and it is testable on its own.
 */
import type { SessionUser } from '@/types';
import { newQuestionId, type Answers, type FormQuestion } from '@/lib/forms';

export const CUSTOMER_PURPOSES = [
  'SAVINGS_APPLICATION',
  'PARTNERSHIP_APPLICATION',
  'FIXED_DEPOSIT_APPLICATION',
  'LOAN_APPLICATION',
  'GUARANTOR',
] as const;

export type CustomerPurpose = (typeof CUSTOMER_PURPOSES)[number];

export const isCustomerPurpose = (p: unknown): p is CustomerPurpose =>
  typeof p === 'string' && (CUSTOMER_PURPOSES as readonly string[]).includes(p);

/** Forms whose respondent becomes a customer. A guarantor stands behind one; they are not profiled. */
export const isApplicantPurpose = (p: unknown): p is Exclude<CustomerPurpose, 'GUARANTOR'> =>
  isCustomerPurpose(p) && p !== 'GUARANTOR';

export const PURPOSE_INFO: Record<CustomerPurpose, {
  label: string;
  /** The paper form's title, used for a new form. */
  title: string;
  /** Prefix of the reference an applicant is given. */
  refPrefix: string;
  /** Who reviews it: anyone holding one of these. The first opens the account itself. */
  reviewers: string[];
}> = {
  SAVINGS_APPLICATION: {
    label: 'Savings',
    title: 'Savings Registration Form',
    refPrefix: 'SV',
    reviewers: ['SAVINGS:CREATE', 'SAVINGS:APPROVE'],
  },
  PARTNERSHIP_APPLICATION: {
    label: 'Mutual partnership',
    title: 'Mutual Partnership Form',
    refPrefix: 'MP',
    reviewers: ['SAVINGS:CREATE', 'SAVINGS:APPROVE'],
  },
  FIXED_DEPOSIT_APPLICATION: {
    label: 'Fixed deposit',
    title: 'Fixed Deposit Form',
    refPrefix: 'FD',
    reviewers: ['FIXED_DEPOSITS:CREATE', 'FIXED_DEPOSITS:MANAGE'],
  },
  LOAN_APPLICATION: {
    label: 'Loan',
    title: 'Loan Application Form',
    refPrefix: 'LA',
    reviewers: ['LOANS:CREATE', 'LOANS:MANAGE_ALL'],
  },
  GUARANTOR: {
    label: 'Guarantor',
    title: "Guarantor's Registration Form",
    refPrefix: 'GR',
    reviewers: ['LOANS:CREATE', 'LOANS:MANAGE_ALL'],
  },
};

/** Guarantors each loan application needs. */
export const GUARANTORS_REQUIRED = 2;

export function canReviewPurpose(user: Pick<SessionUser, 'permissions'>, purpose: CustomerPurpose): boolean {
  return PURPOSE_INFO[purpose].reviewers.some((p) => user.permissions.includes(p));
}

/** The application kinds this person reviews (a guarantor is reviewed with its loan). */
export function reviewablePurposes(user: Pick<SessionUser, 'permissions'>): Exclude<CustomerPurpose, 'GUARANTOR'>[] {
  return CUSTOMER_PURPOSES.filter(isApplicantPurpose).filter((p) => canReviewPurpose(user, p));
}

// ─── Plans written on the paper forms ───────────────────────────────────────

/** Fixed deposit contract choices: total interest for the whole term. */
export const FD_PLANS = [
  { label: '6 months (15%)', months: 6, totalRate: 15 },
  { label: '12 months (30%)', months: 12, totalRate: 30 },
  { label: '18 months (50%)', months: 18, totalRate: 50 },
] as const;

/** The mutual partnership's single contract. */
export const PARTNERSHIP_PLAN = { label: '5 months (20%)', months: 5, totalRate: 20 } as const;

// ─── Questions ──────────────────────────────────────────────────────────────

const q = (id: string, type: FormQuestion['type'], label: string, required = false, extra: Partial<FormQuestion> = {}): FormQuestion =>
  ({ id, type, label, required, ...extra });

const GENDERS = ['Male', 'Female'];
const MARITAL = ['Single', 'Married', 'Divorced', 'Widowed'];
const RELIGIONS = ['Christianity', 'Islam', 'Others'];
const ID_TYPES = ["National ID (NIN)", "International passport", "Voter's card", "Driver's licence"];
const EMPLOYMENT = ['Employed', 'Self-employed', 'Unemployed', 'Others'];

const NAME = [
  q('firstName', 'SHORT_TEXT', 'First name', true),
  q('middleName', 'SHORT_TEXT', 'Middle name'),
  q('lastName', 'SHORT_TEXT', 'Surname', true),
];
const CONTACT = [
  q('phone', 'PHONE', 'Phone number', true),
  q('alternatePhone', 'PHONE', 'Second phone number'),
  q('email', 'EMAIL', 'Email address'),
  q('address', 'PARAGRAPH', 'Residential address', true),
  q('city', 'SHORT_TEXT', 'City / town'),
];
const BIO = [
  q('dateOfBirth', 'DATE', 'Date of birth'),
  q('gender', 'MULTIPLE_CHOICE', 'Gender', false, { options: GENDERS }),
  q('maritalStatus', 'MULTIPLE_CHOICE', 'Marital status', false, { options: MARITAL }),
];
const ID = [
  q('idType', 'MULTIPLE_CHOICE', 'Means of identification', false, { options: ID_TYPES }),
  q('idNumber', 'SHORT_TEXT', 'ID number'),
];
const WORK = [
  q('occupation', 'SHORT_TEXT', 'Occupation'),
  q('employer', 'SHORT_TEXT', 'Name of organisation / business'),
  q('employerAddress', 'PARAGRAPH', 'Address of workplace / business'),
];
const NEXT_OF_KIN = [
  q('nokName', 'SHORT_TEXT', 'Name of next of kin'),
  q('nokRelationship', 'SHORT_TEXT', 'Relationship with next of kin'),
  q('nokPhone', 'PHONE', 'Next of kin phone number'),
  q('nokAddress', 'PARAGRAPH', 'Next of kin address'),
];
const AMOUNT = q('amount', 'NUMBER', 'Amount in figures (₦)', true, { help: 'Numbers only, e.g. 500000' });

/**
 * The questions a form of each kind must keep. Their ids are what approval
 * reads, so they can be reworded but not removed or retyped (lib/forms
 * enforceOnboardingFields does the same for staff).
 */
export const LOCKED_FIELDS: Record<CustomerPurpose, FormQuestion[]> = {
  SAVINGS_APPLICATION: [
    ...NAME, ...CONTACT, ...BIO, ...ID, ...WORK, ...NEXT_OF_KIN,
    q('duration', 'SHORT_TEXT', 'Savings duration', true, { help: 'How long you want to save, e.g. 6 months' }),
    q('amount', 'NUMBER', 'Amount you will start with (₦)', false, { help: 'Numbers only, e.g. 50000' }),
  ],
  PARTNERSHIP_APPLICATION: [
    ...NAME, ...CONTACT, ...BIO, ...ID, ...WORK, ...NEXT_OF_KIN, AMOUNT,
  ],
  FIXED_DEPOSIT_APPLICATION: [
    q('plan', 'MULTIPLE_CHOICE', 'Contract duration', true, { options: FD_PLANS.map((p) => p.label) }),
    ...NAME, ...CONTACT, ...BIO, ...ID, ...WORK, ...NEXT_OF_KIN, AMOUNT,
  ],
  LOAN_APPLICATION: [
    ...NAME, ...CONTACT, ...BIO, ...ID, ...WORK,
    q('amount', 'NUMBER', 'Loan amount requested (₦)', true, { help: 'Numbers only, e.g. 300000' }),
    q('loanPurpose', 'PARAGRAPH', 'Loan purpose', true),
    q('tenure', 'NUMBER', 'Tenure (months)', true, { help: 'How many months you need to repay. Repayment is daily.' }),
  ],
  GUARANTOR: [
    ...NAME,
    q('phone', 'PHONE', 'Phone number', true),
    q('alternatePhone', 'PHONE', 'Second phone number'),
    q('email', 'EMAIL', 'Email address'),
    q('address', 'PARAGRAPH', 'Address', true),
    q('relationship', 'SHORT_TEXT', 'Your relationship with the applicant', true, { help: 'e.g. brother, colleague, friend' }),
    q('occupation', 'SHORT_TEXT', 'Occupation', true),
    q('employer', 'SHORT_TEXT', 'Name of organisation / business'),
    q('employerAddress', 'PARAGRAPH', 'Address of workplace', true),
    ...BIO, ...ID,
  ],
};

/** Ids that must stay required: a profile cannot be made without them. */
const REQUIRED_IDS: Record<CustomerPurpose, string[]> = {
  SAVINGS_APPLICATION: ['firstName', 'lastName', 'phone', 'address'],
  PARTNERSHIP_APPLICATION: ['firstName', 'lastName', 'phone', 'address', 'amount'],
  FIXED_DEPOSIT_APPLICATION: ['firstName', 'lastName', 'phone', 'address', 'amount', 'plan'],
  LOAN_APPLICATION: ['firstName', 'lastName', 'phone', 'address', 'amount', 'tenure'],
  GUARANTOR: ['firstName', 'lastName', 'phone', 'address'],
};

export const isLockedField = (purpose: CustomerPurpose, id: string) => LOCKED_FIELDS[purpose].some((f) => f.id === id);
export const isRequiredField = (purpose: CustomerPurpose, id: string) => REQUIRED_IDS[purpose].includes(id);

const passport = () =>
  q(newQuestionId(), 'FILE', 'Passport photograph', false, { fileKinds: ['IMAGE'], maxFiles: 1, maxSizeMb: 10 });
const idCopy = () =>
  q(newQuestionId(), 'FILE', 'Photo or scan of your ID', false, { fileKinds: ['IMAGE', 'PDF'], maxFiles: 2, maxSizeMb: 10 });
const origin = () => [
  q(newQuestionId(), 'SHORT_TEXT', 'Nationality'),
  q(newQuestionId(), 'SHORT_TEXT', 'State of origin'),
  q(newQuestionId(), 'SHORT_TEXT', 'L.G.A.'),
];
const religion = () => q(newQuestionId(), 'MULTIPLE_CHOICE', 'Religion', false, { options: RELIGIONS });
const kids = () => q(newQuestionId(), 'NUMBER', 'Number of children');
const referral = () => q(newQuestionId(), 'SHORT_TEXT', 'Referred by');
const bank = () => [
  q(newQuestionId(), 'SHORT_TEXT', 'Bank account name'),
  q(newQuestionId(), 'SHORT_TEXT', 'Bank account number'),
  q(newQuestionId(), 'SHORT_TEXT', 'Bank name'),
];
const declare = (label: string) =>
  q(newQuestionId(), 'CHECKBOXES', 'Declaration', true, { options: [label] });

const TRUE_AND_CORRECT = 'I confirm that the information I have given is true and correct';

/**
 * A fresh form of a kind: the locked questions in the paper form's order,
 * plus the paper form's other questions, which staff may edit or remove.
 */
export function customerFormTemplate(purpose: CustomerPurpose): FormQuestion[] {
  const locked = (ids: string[]) => ids.map((id) => {
    const f = LOCKED_FIELDS[purpose].find((x) => x.id === id);
    if (!f) throw new Error(`No locked field ${id} on ${purpose}`);
    return { ...f, options: f.options?.slice() };
  });
  const lockedAll = () => LOCKED_FIELDS[purpose].map((f) => ({ ...f, options: f.options?.slice() }));
  const person = ['firstName', 'middleName', 'lastName', 'phone', 'alternatePhone', 'email', 'address', 'city', 'dateOfBirth', 'gender', 'maritalStatus'];

  switch (purpose) {
    case 'SAVINGS_APPLICATION':
      return [
        ...locked(person), kids(), religion(), ...origin(),
        ...locked(['occupation', 'employer', 'employerAddress', 'idType', 'idNumber']), idCopy(),
        ...locked(['nokName', 'nokAddress', 'nokRelationship', 'nokPhone']),
        ...locked(['duration', 'amount']), referral(), passport(),
        declare(`${TRUE_AND_CORRECT}. I understand the registration fee of ₦1,000 is non-refundable.`),
      ];
    case 'PARTNERSHIP_APPLICATION':
    case 'FIXED_DEPOSIT_APPLICATION':
      return [
        ...(purpose === 'FIXED_DEPOSIT_APPLICATION' ? locked(['plan']) : []),
        ...locked(person),
        q(newQuestionId(), 'SHORT_TEXT', 'Nearest bus stop / landmark'),
        ...origin(), q(newQuestionId(), 'SHORT_TEXT', 'Home town'), religion(),
        ...locked(['idType', 'idNumber']), idCopy(),
        q(newQuestionId(), 'MULTIPLE_CHOICE', 'Employment status', false, { options: EMPLOYMENT }),
        ...locked(['occupation', 'employer', 'employerAddress', 'amount']),
        ...bank(), q(newQuestionId(), 'MULTIPLE_CHOICE', 'Account type', false, { options: ['Savings', 'Current'] }),
        ...locked(['nokName', 'nokAddress', 'nokRelationship', 'nokPhone']),
        referral(), passport(),
        declare(TRUE_AND_CORRECT),
      ];
    case 'LOAN_APPLICATION':
      return [
        ...locked(person), ...locked(['idType', 'idNumber']), idCopy(),
        ...locked(['occupation']),
        q(newQuestionId(), 'SHORT_TEXT', 'Nature of business'),
        ...locked(['employer', 'employerAddress', 'amount', 'loanPurpose', 'tenure']),
        ...bank(), referral(), passport(),
        q(newQuestionId(), 'CHECKBOXES', 'Legal agreement', true, {
          options: ['I acknowledge and agree to this legally binding process for the preparation and execution of loan documentation'],
        }),
        q(newQuestionId(), 'CHECKBOXES', 'Insurance agreement', true, {
          options: ['I agree to the inclusion of loan protection insurance, to safeguard against unforeseen circumstances such as death, disability or job loss that may affect loan repayment'],
        }),
        declare(
          'I declare that all the information provided is true and correct. I authorise Hy-Link Multipurpose Cooperative ' +
          'Society Ltd to verify my details and take necessary actions in the case of default. I understand and accept the ' +
          'terms relating to legal fees and insurance.'
        ),
      ];
    case 'GUARANTOR':
      return [
        ...lockedAll().filter((f) => !['idType', 'idNumber', 'dateOfBirth', 'gender', 'maritalStatus'].includes(f.id)),
        ...locked(['dateOfBirth', 'gender', 'maritalStatus']), kids(), religion(), ...origin(),
        ...NEXT_OF_KIN.map((f) => ({ ...f, id: newQuestionId() })),
        ...locked(['idType', 'idNumber']), idCopy(), referral(), passport(),
        ...GUARANTOR_CHEQUE_QUESTIONS.map((f) => ({ ...f, options: f.options?.slice() })),
        declare(
          'I understand that as guarantor I am to make the payment in a case where the borrower fails to pay or cannot be ' +
          'reached. I understand the registration fee of ₦2,000 is non-refundable.'
        ),
      ];
  }
}

// ─── Guarantor cheques ──────────────────────────────────────────────────────

/** The cheque questions every guarantor form asks, by fixed id. */
export const GUARANTOR_CHEQUE_QUESTIONS: FormQuestion[] = [
  q('chequesSubmitted', 'MULTIPLE_CHOICE', 'Are you submitting cheques for this loan?', false, { options: ['Yes', 'No'] }),
  q('chequeBank', 'SHORT_TEXT', 'Bank the cheques are drawn on'),
  q('chequeNumbers', 'PARAGRAPH', 'Cheque numbers', false, {
    help: 'One cheque per line, with the amount if it is written, e.g. 00012345 - 50000',
  }),
];

/**
 * A guarantor form's questions with the cheque questions in, before the
 * declaration, for forms published before they existed. Other kinds of form
 * come back as they are.
 */
export function withGuarantorCheques(purpose: unknown, questions: FormQuestion[]): FormQuestion[] {
  if (purpose !== 'GUARANTOR') return questions;
  const have = new Set(questions.map((x) => x.id));
  const missing = GUARANTOR_CHEQUE_QUESTIONS.filter((x) => !have.has(x.id)).map((x) => ({ ...x, options: x.options?.slice() }));
  if (missing.length === 0) return questions;
  const at = questions.findIndex((x) => x.type === 'CHECKBOXES' && x.label === 'Declaration');
  return at === -1 ? [...questions, ...missing] : [...questions.slice(0, at), ...missing, ...questions.slice(at)];
}

/** The cheques a guarantor listed, as loan-form rows. */
export function guarantorCheques(answers: Answers): { bankName: string; chequeNumber: string; amount: string; chequeDate: string }[] {
  if (text(answers, 'chequesSubmitted') === 'No') return [];
  const bankName = text(answers, 'chequeBank');
  return text(answers, 'chequeNumbers')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [num, ...rest] = line.split(/\s+[-–—:]\s*|\s*[–—:]\s+/);
      const amount = rest.join(' ').replace(/[^\d.]/g, '');
      return { bankName, chequeNumber: num.trim(), amount, chequeDate: '' };
    });
}

export const CUSTOMER_FORM_DESCRIPTION: Record<CustomerPurpose, string> = {
  SAVINGS_APPLICATION:
    'Hy-Link Finance Limited. Head office: Suite 24, Long John Plaza, 34 Agip Road, Port Harcourt.\n' +
    'Fill in your details exactly as they appear on your ID. A savings officer will review them and contact you.\n' +
    'Registration fee: ₦1,000 (non-refundable).',
  PARTNERSHIP_APPLICATION:
    'Contract duration: 5 months, 20%.\n' +
    'Partnering with Hy-Link attracts monthly interest, paid at the expiration of the contract. Capital is paid after 15 working days.\n' +
    'Fill in your details exactly as they appear on your ID. An officer will review them and contact you.',
  FIXED_DEPOSIT_APPLICATION:
    'Partnering with Hy-Link attracts a monthly interest.\n' +
    '₦100k to ₦5M starts counting one working day after confirmation. ₦5M to ₦10M: after 3 working days. ' +
    '₦10M to ₦16M: after 5 working days. ₦16M to ₦25M: after 7 working days. ₦25M to ₦50M: after 15 working days. ' +
    '₦50M and above is by negotiation.\n' +
    'Fill in your details exactly as they appear on your ID. An officer will review them and contact you.',
  LOAN_APPLICATION:
    '7% processing fee. Upon disqualification, you are entitled to 100% of your funds.\n' +
    'Every loan needs two guarantors. When you submit, you will get a link to send to your guarantors.',
  GUARANTOR:
    'Hy-Link Multipurpose Cooperative Society Limited. Head office: Suite 24, Long John Plaza, 34 Agip Road, Port Harcourt.\n' +
    'Registration fee: ₦2,000 (non-refundable).\n' +
    'Note: the guarantor is to make the payment in a case where the borrower fails to pay or cannot be reached.',
};

export const CUSTOMER_FORM_CONFIRMATION: Record<CustomerPurpose, string> = {
  SAVINGS_APPLICATION: 'Thank you. A savings officer will review your details and contact you.',
  PARTNERSHIP_APPLICATION: 'Thank you. An officer will review your details and contact you.',
  FIXED_DEPOSIT_APPLICATION: 'Thank you. An officer will review your details and contact you.',
  LOAN_APPLICATION: 'Thank you. Your application has been received. A loan officer will contact you.',
  GUARANTOR: 'Thank you. Your details have been received and attached to the application.',
};

/**
 * Holds a form to its kind's locked questions: puts back any removed, restores
 * their type and options, and keeps the essential ones required.
 */
export function enforceCustomerFields(purpose: CustomerPurpose, questions: FormQuestion[]): FormQuestion[] {
  const fields = LOCKED_FIELDS[purpose];
  const required = new Set(REQUIRED_IDS[purpose]);
  const have = new Set(questions.map((x) => x.id));
  const fixed = questions.map((x) => {
    const field = fields.find((f) => f.id === x.id);
    if (!field) return x;
    return { ...x, type: field.type, options: field.options?.slice(), required: required.has(x.id) ? true : x.required };
  });
  const missing = fields.filter((f) => !have.has(f.id)).map((f) => ({ ...f, options: f.options?.slice() }));
  return [...missing, ...fixed];
}

// ─── Reading answers ────────────────────────────────────────────────────────

/** The customer profile a response describes, shaped for lib/customer-registration. */
export interface ApplicantDetails {
  firstName: string;
  middleName?: string;
  lastName: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  address: string;
  city?: string;
  dateOfBirth?: string;
  gender?: string;
  maritalStatus?: string;
  occupation?: string;
  employer?: string;
  employerAddress?: string;
  nationalId?: string;
  passportNumber?: string;
  driversLicense?: string;
  idType?: string;
  idNumber?: string;
  nokName?: string;
  nokRelationship?: string;
  nokPhone?: string;
  nokAddress?: string;
}

const text = (answers: Answers, id: string) => (typeof answers[id] === 'string' ? (answers[id] as string).trim() : '');
const opt = (s: string) => s || undefined;

export function applicantDetails(answers: Answers): ApplicantDetails {
  const gender = text(answers, 'gender').toUpperCase();
  const idType = text(answers, 'idType');
  const idNumber = text(answers, 'idNumber');
  // The number goes where the customer record keeps that kind of ID; a voter's
  // card has no column, so it stays on the response alongside the rest.
  const idField =
    /national|nin/i.test(idType) ? 'nationalId' :
    /passport/i.test(idType) ? 'passportNumber' :
    /driver/i.test(idType) ? 'driversLicense' : null;
  return {
    firstName: text(answers, 'firstName'),
    middleName: opt(text(answers, 'middleName')),
    lastName: text(answers, 'lastName'),
    phone: text(answers, 'phone'),
    alternatePhone: opt(text(answers, 'alternatePhone')),
    email: opt(text(answers, 'email').toLowerCase()),
    address: text(answers, 'address'),
    city: opt(text(answers, 'city')),
    dateOfBirth: opt(text(answers, 'dateOfBirth')),
    gender: ['MALE', 'FEMALE'].includes(gender) ? gender : undefined,
    maritalStatus: opt(text(answers, 'maritalStatus')),
    occupation: opt(text(answers, 'occupation')),
    employer: opt(text(answers, 'employer')),
    employerAddress: opt(text(answers, 'employerAddress')),
    idType: opt(idType),
    idNumber: opt(idNumber),
    ...(idField && idNumber ? { [idField]: idNumber } : {}),
    nokName: opt(text(answers, 'nokName')),
    nokRelationship: opt(text(answers, 'nokRelationship')),
    nokPhone: opt(text(answers, 'nokPhone')),
    nokAddress: opt(text(answers, 'nokAddress')),
  };
}

/** What the applicant asked for, ready to prefill the account or loan screen. */
export interface ApplicationTerms {
  amount: number | null;
  /** Savings and partnership: months asked for, when the answer says. */
  durationMonths: number | null;
  durationText: string | null;
  /** Fixed deposit and partnership: the contract chosen. */
  plan: { label: string; months: number; totalRate: number } | null;
  /** Loan. */
  tenureMonths: number | null;
  loanPurpose: string | null;
}

export function applicationTerms(purpose: CustomerPurpose, answers: Answers): ApplicationTerms {
  const num = (id: string) => {
    const v = answers[id];
    const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[₦,\s]/g, ''));
    return v != null && v !== '' && Number.isFinite(n) && n > 0 ? n : null;
  };
  const durationText = text(answers, 'duration') || null;
  const plan =
    purpose === 'FIXED_DEPOSIT_APPLICATION' ? FD_PLANS.find((p) => p.label === text(answers, 'plan')) ?? null :
    purpose === 'PARTNERSHIP_APPLICATION' ? PARTNERSHIP_PLAN : null;
  const tenure = num('tenure');
  return {
    amount: num('amount'),
    durationMonths: durationText ? monthsIn(durationText) : plan?.months ?? null,
    durationText,
    plan: plan ? { label: plan.label, months: plan.months, totalRate: plan.totalRate } : null,
    tenureMonths: tenure ? Math.round(tenure) : null,
    loanPurpose: text(answers, 'loanPurpose') || null,
  };
}

/** "6 months", "6", "1 year", "one year" → months; null when it cannot tell. */
export function monthsIn(s: string): number | null {
  const t = s.toLowerCase().trim();
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, nine: 9, twelve: 12, eighteen: 18, a: 1 };
  const m = t.match(/(\d+(?:\.\d+)?|one|two|three|four|five|six|nine|twelve|eighteen|\ba\b)\s*(years?|yrs?|months?|mths?|mons?)?/);
  if (!m) return null;
  const n = m[1] in words ? words[m[1]] : Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const months = m[2] && /^y/.test(m[2]) ? n * 12 : n;
  return Number.isInteger(months) && months <= 120 ? months : null;
}

/**
 * A fixed deposit's terms as the deposit screen takes them: a tenure in days
 * and an annual rate. The paper form quotes a total for the whole term (15%
 * for 6 months), and the deposit engine pays P × annual rate × days / 365, so
 * the annual rate is the total spread over the term's real length in days.
 */
export function fixedDepositTerms(plan: { months: number; totalRate: number }, start = new Date()): { tenureDays: number; annualRate: number } {
  const end = new Date(start);
  end.setMonth(end.getMonth() + plan.months);
  const tenureDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const annualRate = Math.round(((plan.totalRate * 365) / tenureDays) * 100) / 100;
  return { tenureDays, annualRate };
}

/**
 * The fixed savings plan an application asks for. A partnership takes the
 * plan named for it, else the 5-month 20% plan; savings take the one plan of
 * the duration asked for. Null when it is not clear-cut: the officer chooses.
 */
export function pickSavingsPlan<P extends { id: string; name: string; durationMonths: number | null; totalInterestRate: number | null }>(
  plans: P[],
  want: { partnership: boolean; durationMonths: number | null; totalRate: number | null }
): P | null {
  if (want.partnership) {
    const named = plans.filter((p) => /partner/i.test(p.name));
    if (named.length === 1) return named[0];
  }
  if (!want.durationMonths) return null;
  const fits = plans.filter(
    (p) => p.durationMonths === want.durationMonths && (want.totalRate == null || Number(p.totalInterestRate) === want.totalRate)
  );
  return fits.length === 1 ? fits[0] : null;
}

/** A guarantor's details as the loan screen's guarantor rows hold them. */
export function guarantorDetails(answers: Answers) {
  const d = applicantDetails(answers);
  return {
    firstName: d.firstName,
    middleName: d.middleName ?? '',
    lastName: d.lastName,
    relationship: text(answers, 'relationship'),
    phone: d.phone,
    email: d.email ?? '',
    address: d.address,
    city: d.city ?? '',
    occupation: d.occupation ?? '',
    employer: d.employer ?? '',
    nationalId: d.nationalId ?? '',
    cheques: guarantorCheques(answers),
  };
}

// ─── References ─────────────────────────────────────────────────────────────

/** No 0/O, 1/I/L: it gets read out over the phone. */
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const REF_LENGTH = 6;

/** An application reference, e.g. LA-7K2M9Q. Six characters: too many to guess (about 900 million). */
export function makeReference(purpose: CustomerPurpose, random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < REF_LENGTH; i++) s += REF_ALPHABET[Math.floor(random() * REF_ALPHABET.length)];
  return `${PURPOSE_INFO[purpose].refPrefix}-${s}`;
}

/** A reference as someone typed it: upper case, spaces gone, the dash put back. Null when it cannot be one. */
export function normalizeReference(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const t = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{2}[A-Z0-9]{6}$/.test(t)) return null;
  return `${t.slice(0, 2)}-${t.slice(2)}`;
}

/** Digits a phone number ends with, for matching 0803... against +234803... */
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : null;
}
