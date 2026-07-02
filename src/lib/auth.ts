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
          // Not a staff member — try customer portal login (additive; staff
          // authentication above is unchanged).
          const customer = await prisma.customer.findFirst({
            where: { email, portalEnabled: true, isDeleted: false },
          });
          if (!customer || !customer.passwordHash) return null;

          if (customer.portalLockedUntil && new Date() < customer.portalLockedUntil) {
            throw new Error('Account is locked. Try again later.');
          }
          if (customer.status !== 'ACTIVE') {
            throw new Error('Account is not active. Contact support.');
          }

          const customerOk = await bcrypt.compare(password, customer.passwordHash);
          if (!customerOk) {
            const attempts = customer.portalFailedAttempts + 1;
            const upd: Record<string, unknown> = { portalFailedAttempts: attempts };
            if (attempts >= 5) {
              const lock = new Date();
              lock.setMinutes(lock.getMinutes() + 30);
              upd.portalLockedUntil = lock;
            }
            await prisma.customer.update({ where: { id: customer.id }, data: upd });
            return null;
          }

          await prisma.customer.update({
            where: { id: customer.id },
            data: { portalFailedAttempts: 0, portalLockedUntil: null, portalLastLoginAt: new Date() },
          });

          return {
            id: customer.id,
            email: customer.email as string,
            employeeId: customer.customerNumber,
            firstName: customer.firstName,
            lastName: customer.lastName,
            role: 'Customer',
            roleCode: 'CUSTOMER',
            roleLevel: 0,
            approvalLimit: 0,
            department: 'Customer Portal',
            departmentCode: 'PORTAL',
            branchId: customer.branchId,
            branchName: null,
            permissions: [],
            mustChangePassword: customer.mustResetPassword,
            userType: 'customer',
          };
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
          userType: 'staff',
        };
      },
    }),
  ],
});
