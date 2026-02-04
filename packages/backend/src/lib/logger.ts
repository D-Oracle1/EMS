/**
 * Hylink EMS - Logging Module
 * Structured logging with audit trail support
 */

import winston from 'winston';
import { config } from '../config/index.js';

const { combine, timestamp, printf, colorize, json } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Create logger instance
export const logger = winston.createLogger({
  level: config.logLevel,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    json()
  ),
  defaultMeta: { service: 'hylink-ems' },
  transports: [
    // Error logs
    new winston.transports.File({
      filename: `${config.logFilePath}/error.log`,
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
    // Combined logs
    new winston.transports.File({
      filename: `${config.logFilePath}/combined.log`,
      maxsize: 10485760,
      maxFiles: 10,
    }),
    // Audit logs - separate file for compliance
    new winston.transports.File({
      filename: `${config.logFilePath}/audit.log`,
      level: 'info',
      maxsize: 52428800, // 50MB
      maxFiles: 30,
    }),
  ],
});

// Console output for development
if (config.nodeEnv !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        consoleFormat
      ),
    })
  );
}

// Audit-specific logging function
export function auditLog(
  action: string,
  module: string,
  details: {
    userId?: string;
    entityType?: string;
    entityId?: string;
    description: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
  }
) {
  logger.info('AUDIT', {
    action,
    module,
    ...details,
    timestamp: new Date().toISOString(),
  });
}

// Financial transaction logging
export function financialLog(
  transactionType: string,
  details: {
    amount: number;
    currency?: string;
    debitAccount?: string;
    creditAccount?: string;
    reference: string;
    userId: string;
    description: string;
    metadata?: Record<string, unknown>;
  }
) {
  logger.info('FINANCIAL', {
    transactionType,
    ...details,
    currency: details.currency || 'NGN',
    timestamp: new Date().toISOString(),
  });
}

export default logger;
