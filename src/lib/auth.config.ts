import type { NextAuthConfig } from 'next-auth';
import { resolveLandingPath } from './landing';

/**
 * Auth config that can be used in Edge runtime (middleware).
 * Does NOT include the credentials provider (which needs bcrypt/prisma).
 */
export const authConfig = {
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthPage = nextUrl.pathname === '/login';
      const isChangePasswordPage = nextUrl.pathname === '/change-password';
      const isApiAuth = nextUrl.pathname.startsWith('/api/auth');

      if (isApiAuth) return true;

      const userType = (auth?.user as any)?.userType ?? 'staff';
      // HR-only staff open onto the HR overview rather than the generic dashboard.
      const home = resolveLandingPath(auth?.user as any);

      if (isAuthPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL(home, nextUrl));
        }
        return true;
      }

      if (!isLoggedIn) return false;

      // Enforce mustChangePassword: redirect to /change-password
      const mustChange = (auth?.user as any)?.mustChangePassword;
      if (mustChange && !isChangePasswordPage) {
        return Response.redirect(new URL('/change-password', nextUrl));
      }

      // Role separation: customers live under /portal, staff everywhere else.
      const isPortal = nextUrl.pathname.startsWith('/portal');
      if (userType === 'customer') {
        if (!isPortal && !isChangePasswordPage) {
          return Response.redirect(new URL('/portal', nextUrl));
        }
      } else if (isPortal) {
        return Response.redirect(new URL(home, nextUrl));
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.email = user.email!;
        token.employeeId = user.employeeId;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        token.role = user.role;
        token.roleCode = user.roleCode;
        token.roleLevel = user.roleLevel;
        token.approvalLimit = user.approvalLimit;
        token.department = user.department;
        token.departmentCode = user.departmentCode;
        token.branchId = user.branchId;
        token.branchName = user.branchName;
        token.permissions = user.permissions;
        token.mustChangePassword = user.mustChangePassword;
        token.userType = user.userType ?? 'staff';
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.id,
        email: token.email!,
        employeeId: token.employeeId,
        firstName: token.firstName,
        lastName: token.lastName,
        role: token.role,
        roleCode: token.roleCode,
        roleLevel: token.roleLevel,
        approvalLimit: token.approvalLimit,
        department: token.department,
        departmentCode: token.departmentCode,
        branchId: token.branchId,
        branchName: token.branchName,
        permissions: token.permissions,
        mustChangePassword: token.mustChangePassword,
        userType: token.userType ?? 'staff',
      };
      return session;
    },
  },
  providers: [], // Added in auth.ts with credentials
} satisfies NextAuthConfig;
