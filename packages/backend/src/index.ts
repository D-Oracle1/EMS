/**
 * Hylink Finance Limited
 * Enterprise Management, HR & Accounting System
 *
 * Main Application Entry Point
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Import routes
import authRoutes from './routes/auth.routes.js';
import staffRoutes from './routes/staff.routes.js';
import customerRoutes from './routes/customer.routes.js';
import loanRoutes from './routes/loan.routes.js';
import savingsRoutes from './routes/savings.routes.js';
import fixedDepositRoutes from './routes/fixed-deposit.routes.js';
import accountingRoutes from './routes/accounting.routes.js';
import reportRoutes from './routes/report.routes.js';
import documentRoutes from './routes/document.routes.js';
import hrRoutes from './routes/hr.routes.js';
import verificationRoutes from './routes/verification.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import batchRoutes from './routes/batch.routes.js';

const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
    },
  },
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    });
  });
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.nodeEnv,
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
    });
  }
});

// API Routes
const apiRouter = express.Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/staff', staffRoutes);
apiRouter.use('/customers', customerRoutes);
apiRouter.use('/loans', loanRoutes);
apiRouter.use('/savings', savingsRoutes);
apiRouter.use('/fixed-deposits', fixedDepositRoutes);
apiRouter.use('/accounting', accountingRoutes);
apiRouter.use('/reports', reportRoutes);
apiRouter.use('/documents', documentRoutes);
apiRouter.use('/hr', hrRoutes);
apiRouter.use('/verification', verificationRoutes);
apiRouter.use('/notifications', notificationRoutes);
apiRouter.use('/batch', batchRoutes);

app.use('/api/v1', apiRouter);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  try {
    await prisma.$disconnect();
    logger.info('Database connection closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    app.listen(config.port, () => {
      logger.info(`
╔════════════════════════════════════════════════════════════╗
║       HYLINK FINANCE LIMITED - EMS Backend Server          ║
║════════════════════════════════════════════════════════════║
║  Environment: ${config.nodeEnv.padEnd(43)}║
║  Port: ${config.port.toString().padEnd(50)}║
║  API Base: /api/v1                                         ║
║════════════════════════════════════════════════════════════║
║  Modules:                                                  ║
║    • Authentication & RBAC                                 ║
║    • HR & Staff Management                                 ║
║    • Customer Management                                   ║
║    • Loans (Full Workflow)                                 ║
║    • Savings                                               ║
║    • Fixed Deposits                                        ║
║    • Double-Entry Accounting                               ║
║    • Reports & Analytics                                   ║
║    • Document Archive                                      ║
╚════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

startServer();

export default app;
