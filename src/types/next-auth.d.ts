import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      employeeId: string;
      firstName: string;
      lastName: string;
      role: string;
      roleCode: string;
      roleLevel: number;
      approvalLimit: number;
      department: string;
      departmentCode: string;
      branchId: string | null;
      branchName: string | null;
      permissions: string[];
      mustChangePassword: boolean;
    };
  }

  interface User {
    id: string;
    email: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    role: string;
    roleCode: string;
    roleLevel: number;
    approvalLimit: number;
    department: string;
    departmentCode: string;
    branchId: string | null;
    branchName: string | null;
    permissions: string[];
    mustChangePassword: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    role: string;
    roleCode: string;
    roleLevel: number;
    approvalLimit: number;
    department: string;
    departmentCode: string;
    branchId: string | null;
    branchName: string | null;
    permissions: string[];
    mustChangePassword: boolean;
  }
}
