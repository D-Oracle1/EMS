import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { authConfig } from './auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const staff = await prisma.staff.findUnique({
          where: { email },
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
          return null;
        }

        // Check if account is locked
        if (staff.lockedUntil && new Date() < staff.lockedUntil) {
          throw new Error('Account is locked. Try again later.');
        }

        // Check if account is active
        if (staff.status !== 'ACTIVE') {
          throw new Error('Account is not active. Contact administrator.');
        }

        // Verify password
        const isValid = await bcrypt.compare(password, staff.passwordHash);

        if (!isValid) {
          // Increment failed login attempts
          const failedAttempts = staff.failedLoginAttempts + 1;
          const updateData: Record<string, unknown> = {
            failedLoginAttempts: failedAttempts,
          };

          // Lock account after 5 failed attempts for 30 minutes
          if (failedAttempts >= 5) {
            const lockUntil = new Date();
            lockUntil.setMinutes(lockUntil.getMinutes() + 30);
            updateData.lockedUntil = lockUntil;
          }

          await prisma.staff.update({
            where: { id: staff.id },
            data: updateData,
          });

          // Audit log failed login attempt
          await prisma.auditLog.create({
            data: {
              userId: staff.id,
              userEmail: staff.email,
              userRole: staff.role.code,
              action: 'LOGIN_FAILED',
              module: 'AUTH',
              entityType: 'STAFF',
              entityId: staff.id,
              description: `Failed login attempt for ${staff.email} (attempt ${failedAttempts}${failedAttempts >= 5 ? ' - account locked' : ''})`,
            },
          });

          return null;
        }

        // Reset failed login attempts on successful login
        await prisma.staff.update({
          where: { id: staff.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        });

        // Create audit log
        await prisma.auditLog.create({
          data: {
            userId: staff.id,
            userEmail: staff.email,
            userRole: staff.role.code,
            action: 'LOGIN',
            module: 'AUTH',
            entityType: 'STAFF',
            entityId: staff.id,
            description: `Staff ${staff.firstName} ${staff.lastName} logged in`,
          },
        });

        const permissions = staff.role.permissions.map(
          (rp) => rp.permission.code
        );

        return {
          id: staff.id,
          email: staff.email,
          employeeId: staff.employeeId,
          firstName: staff.firstName,
          lastName: staff.lastName,
          role: staff.role.name,
          roleCode: staff.role.code,
          roleLevel: staff.role.level,
          approvalLimit: staff.role.approvalLimit
            ? Number(staff.role.approvalLimit)
            : 0,
          department: staff.department.name,
          departmentCode: staff.department.code,
          branchId: staff.branchId,
          branchName: staff.branch?.name ?? null,
          permissions,
          mustChangePassword: staff.mustChangePassword,
        };
      },
    }),
  ],
});
