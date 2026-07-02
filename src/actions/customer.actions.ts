'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission, getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { generateReference } from '@/lib/utils';
import { provisionCustomerLogin } from '@/lib/customer-auth';
import type { ActionResult } from '@/types';

export async function getCustomers(filters?: {
  search?: string;
  status?: string;
  type?: string;
  branchId?: string;
  page?: number;
  limit?: number;
}) {
  await requirePermission('CUSTOMERS:READ');

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (filters?.status) where.status = filters.status;
  if (filters?.type) where.customerType = filters.type;
  if (filters?.branchId) where.branchId = filters.branchId;
  if (filters?.search) {
    where.OR = [
      { firstName: { contains: filters.search, mode: 'insensitive' } },
      { lastName: { contains: filters.search, mode: 'insensitive' } },
      { customerNumber: { contains: filters.search, mode: 'insensitive' } },
      { phone: { contains: filters.search } },
      { email: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.customer.findMany({
      where: where as any,
      include: {
        branch: { select: { name: true } },
        _count: { select: { loans: true, savingsAccounts: true, fixedDeposits: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.customer.count({ where: where as any }),
  ]);

  return {
    data: data.map((c) => ({
      ...c,
      monthlyIncome: c.monthlyIncome?.toNumber() || 0,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function searchCustomers(query: string) {
  await requirePermission('CUSTOMERS:READ');

  if (!query || query.length < 2) return [];

  return prisma.customer.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { customerNumber: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query } },
      ],
    },
    select: {
      id: true,
      customerNumber: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
    },
    orderBy: { firstName: 'asc' },
    take: 10,
  });
}

export async function getCustomer(id: string) {
  await requirePermission('CUSTOMERS:READ');

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      branch: true,
      loans: {
        orderBy: { createdAt: 'desc' },
        include: { product: { select: { name: true } } },
      },
      savingsAccounts: {
        orderBy: { createdAt: 'desc' },
        include: { product: { select: { name: true } } },
      },
      fixedDeposits: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!customer) throw new Error('Customer not found');

  return {
    ...customer,
    monthlyIncome: customer.monthlyIncome?.toNumber() || 0,
    loans: customer.loans.map((l) => ({
      ...l,
      principalAmount: l.principalAmount.toNumber(),
      totalRepayment: l.totalRepayment.toNumber(),
      interestRate: l.interestRate.toNumber(),
    })),
    savingsAccounts: customer.savingsAccounts.map((s) => ({
      ...s,
      currentBalance: s.currentBalance.toNumber(),
    })),
    fixedDeposits: customer.fixedDeposits.map((fd) => ({
      ...fd,
      principalAmount: fd.principalAmount.toNumber(),
      maturityAmount: fd.maturityAmount.toNumber(),
      interestRate: fd.interestRate.toNumber(),
    })),
  };
}

export async function createCustomer(data: {
  customerType: string;
  title?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  phone: string;
  email?: string;
  address: string;
  city?: string;
  state?: string;
  dateOfBirth?: string;
  gender?: string;
  occupation?: string;
  employer?: string;
  monthlyIncome?: number;
  bvn?: string;
  nationalId?: string;
  nokName?: string;
  nokRelationship?: string;
  nokPhone?: string;
  nokAddress?: string;
  companyName?: string;
  rcNumber?: string;
  branchId?: string;
}): Promise<ActionResult<{ id: string; customerNumber: string }>> {
  try {
    const user = await requirePermission('CUSTOMERS:CREATE');

    const customerNumber = await generateReference('CUSTOMER');
    const branchId = data.branchId || user.branchId;

    if (!branchId) {
      return { success: false, error: 'No branch assigned. Please contact your administrator.' };
    }

    const customer = await prisma.customer.create({
      data: {
        customerNumber,
        customerType: data.customerType as any,
        title: data.title,
        firstName: data.firstName,
        lastName: data.lastName,
        middleName: data.middleName,
        phone: data.phone,
        email: data.email,
        address: data.address,
        city: data.city,
        state: data.state,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        gender: data.gender,
        occupation: data.occupation,
        employer: data.employer,
        monthlyIncome: data.monthlyIncome,
        bvn: data.bvn,
        nationalId: data.nationalId,
        nokName: data.nokName,
        nokRelationship: data.nokRelationship,
        nokPhone: data.nokPhone,
        nokAddress: data.nokAddress,
        companyName: data.companyName,
        rcNumber: data.rcNumber,
        branchId,
        createdBy: user.id,
      },
    });

    await auditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.roleCode,
      action: 'CREATE',
      module: 'CUSTOMERS',
      entityType: 'CUSTOMER',
      entityId: customer.id,
      description: `Created customer ${customer.customerNumber}: ${data.firstName} ${data.lastName}`,
    });

    await provisionCustomerLogin(customer.id);

    return {
      success: true,
      message: `Customer ${customerNumber} created successfully`,
      data: { id: customer.id, customerNumber },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create customer' };
  }
}

export async function quickCreateCustomer(data: {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  nationalId?: string;
}): Promise<ActionResult<{ id: string; customerNumber: string; firstName: string; lastName: string }>> {
  try {
    const user = await requirePermission('CUSTOMERS:CREATE');

    const customerNumber = await generateReference('CUSTOMER');

    const customer = await prisma.customer.create({
      data: {
        customerNumber,
        customerType: 'INDIVIDUAL' as any,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email || undefined,
        nationalId: data.nationalId || undefined,
        address: 'To be verified',
        branchId: user.branchId,
        createdBy: user.id,
      },
    });

    await auditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.roleCode,
      action: 'CREATE',
      module: 'CUSTOMERS',
      entityType: 'CUSTOMER',
      entityId: customer.id,
      description: `Quick-created customer ${customerNumber}: ${data.firstName} ${data.lastName} (from loan form)`,
    });

    await provisionCustomerLogin(customer.id);

    return {
      success: true,
      message: `Customer ${customerNumber} created`,
      data: { id: customer.id, customerNumber, firstName: data.firstName, lastName: data.lastName },
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create customer' };
  }
}

const ALLOWED_UPDATE_FIELDS = [
  'title', 'firstName', 'lastName', 'middleName',
  'phone', 'email', 'address', 'city', 'state',
  'dateOfBirth', 'gender', 'occupation', 'employer', 'monthlyIncome',
  'bvn', 'nationalId',
  'nokName', 'nokRelationship', 'nokPhone', 'nokAddress',
  'companyName', 'rcNumber',
] as const;

export async function updateCustomer(
  id: string,
  data: Record<string, unknown>
): Promise<ActionResult> {
  try {
    const user = await requirePermission('CUSTOMERS:UPDATE');

    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) return { success: false, error: 'Customer not found' };

    const sanitized: Record<string, unknown> = {};
    for (const key of ALLOWED_UPDATE_FIELDS) {
      if (key in data) {
        sanitized[key] = data[key];
      }
    }

    await prisma.customer.update({
      where: { id },
      data: sanitized as any,
    });

    await auditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.roleCode,
      action: 'UPDATE',
      module: 'CUSTOMERS',
      entityType: 'CUSTOMER',
      entityId: id,
      description: `Updated customer ${existing.customerNumber}`,
      changedFields: Object.keys(sanitized),
    });

    return { success: true, message: 'Customer updated successfully' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update customer' };
  }
}

export async function verifyCustomerKYC(
  customerId: string
): Promise<ActionResult> {
  try {
    const user = await requirePermission('CUSTOMERS:UPDATE');

    await prisma.customer.update({
      where: { id: customerId },
      data: {
        kycVerified: true,
        kycVerifiedAt: new Date(),
        kycVerifiedBy: user.id,
      },
    });

    await auditLog({
      userId: user.id,
      userEmail: user.email,
      userRole: user.roleCode,
      action: 'UPDATE',
      module: 'CUSTOMERS',
      entityType: 'CUSTOMER',
      entityId: customerId,
      description: `KYC verified for customer`,
    });

    return { success: true, message: 'KYC verification completed' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
