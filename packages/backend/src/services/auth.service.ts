/**
 * Hylink EMS - Authentication Service
 * Handles user authentication, session management, and password security
 */

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { addHours, addDays, addMinutes } from 'date-fns';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { config } from '../config/index.js';
import { generateTokens, refreshTokens } from '../middleware/auth.js';
import { auditLogin } from '../middleware/audit.js';
import { UnauthorizedError, NotFoundError, BusinessError } from '../utils/errors.js';
import { generateToken } from '../utils/helpers.js';

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    employeeId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    department: string;
    branch?: string;
    mustChangePassword: boolean;
  };
}

interface PasswordChangeRequest {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

export class AuthService {
  /**
   * Authenticate user with email and password
   */
  async login(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResult> {
    // Find user
    const staff = await prisma.staff.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        role: true,
        department: true,
        branch: true,
      },
    });

    if (!staff) {
      await auditLogin(email, false, undefined, ipAddress, userAgent);
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check if account is active
    if (staff.status !== 'ACTIVE') {
      await auditLogin(email, false, staff.id, ipAddress, userAgent);
      throw new UnauthorizedError(`Account is ${staff.status.toLowerCase()}`);
    }

    // Check if account is locked
    if (staff.lockedUntil && staff.lockedUntil > new Date()) {
      await auditLogin(email, false, staff.id, ipAddress, userAgent);
      throw new UnauthorizedError(
        `Account is locked. Try again after ${staff.lockedUntil.toLocaleString()}`
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, staff.passwordHash);

    if (!isValidPassword) {
      // Increment failed attempts
      const failedAttempts = staff.failedLoginAttempts + 1;
      const updateData: { failedLoginAttempts: number; lockedUntil?: Date } = {
        failedLoginAttempts: failedAttempts,
      };

      // Lock account if max attempts reached
      if (failedAttempts >= config.maxLoginAttempts) {
        updateData.lockedUntil = addMinutes(new Date(), config.lockoutDurationMinutes);
        logger.warn('Account locked due to failed login attempts', {
          userId: staff.id,
          email,
          failedAttempts,
        });
      }

      await prisma.staff.update({
        where: { id: staff.id },
        data: updateData,
      });

      await auditLogin(email, false, staff.id, ipAddress, userAgent);
      throw new UnauthorizedError('Invalid email or password');
    }

    // Reset failed attempts and update last login
    await prisma.staff.update({
      where: { id: staff.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    // Create session
    const sessionId = uuidv4();
    const sessionExpiry = addHours(new Date(), 8);

    await prisma.userSession.create({
      data: {
        id: sessionId,
        staffId: staff.id,
        token: generateToken(64),
        ipAddress,
        userAgent,
        expiresAt: sessionExpiry,
      },
    });

    // Generate JWT tokens
    const tokens = await generateTokens(staff.id, sessionId);

    await auditLogin(email, true, staff.id, ipAddress, userAgent);

    logger.info('User logged in', { userId: staff.id, email });

    return {
      ...tokens,
      user: {
        id: staff.id,
        employeeId: staff.employeeId,
        email: staff.email,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: staff.role.name,
        department: staff.department.name,
        branch: staff.branch?.name,
        mustChangePassword: staff.mustChangePassword,
      },
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(token: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    return refreshTokens(token);
  }

  /**
   * Logout - revoke session
   */
  async logout(sessionId: string): Promise<void> {
    await prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    logger.info('User logged out', { sessionId });
  }

  /**
   * Logout from all sessions
   */
  async logoutAll(userId: string): Promise<number> {
    const result = await prisma.userSession.updateMany({
      where: {
        staffId: userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    logger.info('User logged out from all sessions', { userId, count: result.count });
    return result.count;
  }

  /**
   * Change password
   */
  async changePassword(request: PasswordChangeRequest): Promise<void> {
    const { userId, currentPassword, newPassword } = request;

    const staff = await prisma.staff.findUnique({
      where: { id: userId },
    });

    if (!staff) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, staff.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Validate new password
    this.validatePassword(newPassword);

    // Hash and update password
    const newPasswordHash = await bcrypt.hash(newPassword, config.bcryptRounds);

    await prisma.staff.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      },
    });

    // Revoke all sessions to force re-login
    await this.logoutAll(userId);

    logger.info('Password changed', { userId });
  }

  /**
   * Admin reset password
   */
  async resetPassword(
    userId: string,
    resetById: string
  ): Promise<{ temporaryPassword: string }> {
    const staff = await prisma.staff.findUnique({
      where: { id: userId },
    });

    if (!staff) {
      throw new NotFoundError('User not found');
    }

    // Generate temporary password
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, config.bcryptRounds);

    await prisma.staff.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Revoke all sessions
    await this.logoutAll(userId);

    logger.info('Password reset by admin', { userId, resetById });

    return { temporaryPassword };
  }

  /**
   * Unlock account
   */
  async unlockAccount(userId: string, unlockedById: string): Promise<void> {
    await prisma.staff.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    logger.info('Account unlocked', { userId, unlockedById });
  }

  /**
   * Validate password meets requirements
   */
  private validatePassword(password: string): void {
    const errors: string[] = [];

    if (password.length < config.passwordMinLength) {
      errors.push(`Password must be at least ${config.passwordMinLength} characters`);
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    if (errors.length > 0) {
      throw new BusinessError(errors.join('. '));
    }
  }

  /**
   * Generate temporary password
   */
  private generateTemporaryPassword(): string {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghjkmnpqrstuvwxyz';
    const numbers = '23456789';
    const special = '!@#$%&*';

    let password = '';

    // Ensure at least one of each type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill remaining with random characters
    const allChars = uppercase + lowercase + numbers + special;
    for (let i = 0; i < 8; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Get active sessions for user
   */
  async getActiveSessions(userId: string): Promise<Array<{
    id: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
    expiresAt: Date;
  }>> {
    const sessions = await prisma.userSession.findMany({
      where: {
        staffId: userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions;
  }

  /**
   * Revoke specific session
   */
  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const session = await prisma.userSession.findFirst({
      where: {
        id: sessionId,
        staffId: userId,
      },
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    await prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    logger.info('Session revoked', { sessionId, userId });
  }
}

export const authService = new AuthService();
