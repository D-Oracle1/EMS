/**
 * Hylink EMS - Authentication & Authorization Middleware
 * JWT-based authentication with RBAC
 */

import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config, PERMISSION_MATRIX, ROLE_LEVELS } from '../config/index.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { AuthenticatedRequest, AuthenticatedUser } from '../types/index.js';

interface JwtPayload {
  userId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

/**
 * Authenticate user from JWT token
 */
export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('No authentication token provided');
    }

    const token = authHeader.substring(7);

    // Verify token
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token has expired', 'TOKEN_EXPIRED');
      }
      throw new UnauthorizedError('Invalid token', 'INVALID_TOKEN');
    }

    // Check if session is still valid
    const session = await prisma.userSession.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session || session.revokedAt) {
      throw new UnauthorizedError('Session has been revoked', 'SESSION_REVOKED');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedError('Session has expired', 'SESSION_EXPIRED');
    }

    // Get user with role and permissions
    const staff = await prisma.staff.findUnique({
      where: { id: payload.userId },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
        department: true,
        branch: true,
      },
    });

    if (!staff) {
      throw new UnauthorizedError('User not found');
    }

    if (staff.status !== 'ACTIVE') {
      throw new UnauthorizedError(`Account is ${staff.status.toLowerCase()}`, 'ACCOUNT_INACTIVE');
    }

    if (staff.lockedUntil && staff.lockedUntil > new Date()) {
      throw new UnauthorizedError('Account is locked', 'ACCOUNT_LOCKED');
    }

    // Build authenticated user context
    const permissions = staff.role.permissions.map(rp =>
      `${rp.permission.module}:${rp.permission.action}`
    );

    const authenticatedUser: AuthenticatedUser = {
      id: staff.id,
      employeeId: staff.employeeId,
      email: staff.email,
      firstName: staff.firstName,
      lastName: staff.lastName,
      roleId: staff.roleId,
      roleCode: staff.role.code,
      roleLevel: staff.role.level,
      approvalLimit: staff.role.approvalLimit?.toNumber() ?? null,
      departmentId: staff.departmentId,
      branchId: staff.branchId,
      permissions,
    };

    req.user = authenticatedUser;
    req.sessionId = payload.sessionId;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Check if user has required permission
 */
export function requirePermission(...requiredPermissions: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Not authenticated');
      }

      const hasPermission = requiredPermissions.some(permission => {
        // Check for wildcard permission
        if (req.user.permissions.includes('*:*')) return true;

        // Check exact permission
        if (req.user.permissions.includes(permission)) return true;

        // Check module-level wildcard
        const [module] = permission.split(':');
        if (req.user.permissions.includes(`${module}:*`)) return true;

        return false;
      });

      if (!hasPermission) {
        logger.warn('Permission denied', {
          userId: req.user.id,
          required: requiredPermissions,
          has: req.user.permissions,
        });
        throw new ForbiddenError('You do not have permission to perform this action');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if user has required role
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Not authenticated');
      }

      if (!allowedRoles.includes(req.user.roleCode)) {
        throw new ForbiddenError('Role not authorized for this action');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if user has minimum role level
 */
export function requireMinLevel(minLevel: number) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Not authenticated');
      }

      if (req.user.roleLevel < minLevel) {
        throw new ForbiddenError('Insufficient authority level');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if user can approve amount (for financial transactions)
 */
export function requireApprovalLimit(getAmount: (req: AuthenticatedRequest) => number) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Not authenticated');
      }

      const amount = getAmount(req);
      const limit = req.user.approvalLimit;

      if (limit === null || limit === 0) {
        throw new ForbiddenError('You are not authorized to approve transactions');
      }

      if (amount > limit) {
        throw new ForbiddenError(
          `Amount exceeds your approval limit. Your limit: ${limit}, Amount: ${amount}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Ensure user cannot approve their own submissions (Segregation of Duties)
 */
export function preventSelfApproval(getCreatorId: (req: AuthenticatedRequest) => string | Promise<string>) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Not authenticated');
      }

      const creatorId = await Promise.resolve(getCreatorId(req));

      if (creatorId === req.user.id) {
        throw new ForbiddenError('You cannot approve your own submission (Segregation of Duties)');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Restrict HR from posting financial transactions
 */
export function preventHRFinancialPosting(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Not authenticated');
    }

    // Check if user is HR role
    const hrRoles = ['HR_ADMIN', 'HR_MANAGER', 'HR_OFFICER'];
    if (hrRoles.includes(req.user.roleCode)) {
      throw new ForbiddenError('HR personnel cannot post financial transactions');
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Branch-level access control
 */
export function requireBranchAccess(getBranchId: (req: AuthenticatedRequest) => string | Promise<string>) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Not authenticated');
      }

      // Admins and Directors can access all branches
      if (req.user.roleLevel >= ROLE_LEVELS.DIRECTOR) {
        return next();
      }

      const targetBranchId = await Promise.resolve(getBranchId(req));

      if (req.user.branchId && req.user.branchId !== targetBranchId) {
        throw new ForbiddenError('You do not have access to this branch');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Generate JWT tokens for user
 */
export async function generateTokens(userId: string, sessionId: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const accessToken = jwt.sign(
    { userId, sessionId },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  const refreshToken = jwt.sign(
    { userId, sessionId, type: 'refresh' },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshExpiresIn }
  );

  // Calculate expiry in seconds
  const decoded = jwt.decode(accessToken) as { exp: number };
  const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

  return { accessToken, refreshToken, expiresIn };
}

/**
 * Verify refresh token and return new tokens
 */
export async function refreshTokens(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  try {
    const payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as JwtPayload & { type: string };

    if (payload.type !== 'refresh') {
      throw new UnauthorizedError('Invalid token type');
    }

    // Verify session is still valid
    const session = await prisma.userSession.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session || session.revokedAt) {
      throw new UnauthorizedError('Session has been revoked');
    }

    return generateTokens(payload.userId, payload.sessionId);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Refresh token has expired');
    }
    throw error;
  }
}
