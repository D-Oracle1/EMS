'use server';

import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import type { ActionResult } from '@/types';

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<ActionResult> {
  try {
    const { user } = await getSession();

    const staff = await prisma.staff.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!staff) {
      return { success: false, error: 'User not found' };
    }

    const isValid = await bcrypt.compare(currentPassword, staff.passwordHash);
    if (!isValid) {
      return { success: false, error: 'Current password is incorrect' };
    }

    // Enforce password complexity: min 8 chars, uppercase, lowercase, digit, special char
    if (newPassword.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' };
    }
    if (!/[A-Z]/.test(newPassword)) {
      return { success: false, error: 'Password must contain an uppercase letter' };
    }
    if (!/[a-z]/.test(newPassword)) {
      return { success: false, error: 'Password must contain a lowercase letter' };
    }
    if (!/[0-9]/.test(newPassword)) {
      return { success: false, error: 'Password must contain a number' };
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
      return { success: false, error: 'Password must contain a special character' };
    }
    if (currentPassword === newPassword) {
      return { success: false, error: 'New password must be different from current password' };
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.staff.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      },
    });

    await auditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.roleCode,
      action: 'PASSWORD_CHANGE',
      module: 'AUTH',
      entityType: 'STAFF',
      entityId: user.id,
      description: `Password changed by ${user.firstName} ${user.lastName}`,
    });

    return { success: true, message: 'Password changed successfully' };
  } catch (error) {
    return { success: false, error: 'Failed to change password' };
  }
}

export async function resetStaffPassword(
  staffId: string
): Promise<ActionResult<{ tempPassword: string }>> {
  try {
    const user = await getSession().then((s) => s.user);

    if (!user.permissions.includes('SYSTEM:USER_MANAGE')) {
      return { success: false, error: 'Permission denied' };
    }

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { firstName: true, lastName: true, email: true },
    });

    if (!staff) {
      return { success: false, error: 'Staff member not found' };
    }

    const tempPassword = 'Reset@' + Math.random().toString(36).slice(-6);
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await prisma.staff.update({
      where: { id: staffId },
      data: {
        passwordHash,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await auditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.roleCode,
      action: 'UPDATE',
      module: 'AUTH',
      entityType: 'STAFF',
      entityId: staffId,
      description: `Password reset for ${staff.firstName} ${staff.lastName} by ${user.firstName} ${user.lastName}`,
    });

    return {
      success: true,
      message: 'Password reset successfully',
      data: { tempPassword },
    };
  } catch (error) {
    return { success: false, error: 'Failed to reset password' };
  }
}

export async function unlockAccount(
  staffId: string
): Promise<ActionResult> {
  try {
    const user = await getSession().then((s) => s.user);

    if (!user.permissions.includes('SYSTEM:USER_MANAGE')) {
      return { success: false, error: 'Permission denied' };
    }

    await prisma.staff.update({
      where: { id: staffId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await auditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.roleCode,
      action: 'UPDATE',
      module: 'AUTH',
      entityType: 'STAFF',
      entityId: staffId,
      description: `Account unlocked by ${user.firstName} ${user.lastName}`,
    });

    return { success: true, message: 'Account unlocked' };
  } catch (error) {
    return { success: false, error: 'Failed to unlock account' };
  }
}
