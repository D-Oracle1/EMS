export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', isOperational: boolean = true, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public readonly errors: Array<{ field: string; message: string }>;
  constructor(errors: Array<{ field: string; message: string }>) {
    super('Validation failed', 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', code: string = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class BusinessError extends AppError {
  constructor(message: string, code: string = 'BUSINESS_ERROR') {
    super(message, 400, code);
  }
}

export class WorkflowError extends AppError {
  constructor(message: string) {
    super(message, 400, 'WORKFLOW_ERROR');
  }
}

export class ApprovalError extends AppError {
  constructor(message: string) {
    super(message, 403, 'APPROVAL_ERROR');
  }
}

export class AccountingError extends AppError {
  constructor(message: string) {
    super(message, 400, 'ACCOUNTING_ERROR');
  }
}

export class UnbalancedEntryError extends AccountingError {
  constructor(debit: number, credit: number) {
    super('Journal entry is unbalanced. Debit: ' + debit + ', Credit: ' + credit);
  }
}

export class PeriodClosedError extends AppError {
  constructor(period: string) {
    super('Financial period ' + period + ' is closed', 400, 'PERIOD_CLOSED');
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(message: string) {
    super(message, 400, 'INSUFFICIENT_BALANCE');
  }
}

export function isOperationalError(error: Error): boolean {
  return error instanceof AppError && error.isOperational;
}
