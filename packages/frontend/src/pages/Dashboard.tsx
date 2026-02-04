import { useQuery } from '@tanstack/react-query';
import {
  BanknotesIcon,
  WalletIcon,
  BuildingLibraryIcon,
  UsersIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import clsx from 'clsx';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function Dashboard() {
  const { user, hasPermission } = useAuth();

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const response = await api.get('/reports/dashboard');
      return response.data.data;
    },
    enabled: hasPermission('ACCOUNTS:REPORTS_VIEW'),
  });

  if (!hasPermission('ACCOUNTS:REPORTS_VIEW')) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">Welcome, {user?.firstName}!</h2>
        <p className="text-gray-500 mt-2">Role: {user?.role}</p>
        <p className="text-gray-500 mt-4">
          You don't have permission to view the executive dashboard.
          Please use the navigation menu to access your modules.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const { loans, savings, fixedDeposits, recentActivity } = dashboardData || {};

  const stats = [
    {
      name: 'Total Loans',
      value: loans?.totalLoans || 0,
      subValue: `${formatCurrency(loans?.totalOutstanding || 0)} outstanding`,
      icon: BanknotesIcon,
      change: '+12%',
      changeType: 'positive',
    },
    {
      name: 'Savings Accounts',
      value: savings?.activeAccounts || 0,
      subValue: `${formatCurrency(savings?.totalBalance || 0)} total`,
      icon: WalletIcon,
      change: '+8%',
      changeType: 'positive',
    },
    {
      name: 'Fixed Deposits',
      value: fixedDeposits?.activeCount || 0,
      subValue: `${formatCurrency(fixedDeposits?.totalPrincipal || 0)} principal`,
      icon: BuildingLibraryIcon,
      change: '+5%',
      changeType: 'positive',
    },
    {
      name: 'Overdue Loans',
      value: loans?.overdueCount || 0,
      subValue: `${formatCurrency(loans?.overdueAmount || 0)} at risk`,
      icon: ExclamationTriangleIcon,
      change: '-3%',
      changeType: 'negative',
    },
  ];

  const loanStatusData = loans?.byStatus
    ? Object.entries(loans.byStatus).map(([status, data]: [string, any]) => ({
        name: status.replace(/_/g, ' '),
        value: data.count,
        amount: data.amount,
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Welcome back, {user?.firstName}! Here's your overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.name} className="card p-6">
            <div className="flex items-center justify-between">
              <div className="flex-shrink-0">
                <stat.icon className="h-8 w-8 text-primary-600" />
              </div>
              <div
                className={clsx(
                  'flex items-center text-sm font-medium',
                  stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                )}
              >
                {stat.changeType === 'positive' ? (
                  <ArrowTrendingUpIcon className="h-4 w-4 mr-1" />
                ) : (
                  <ArrowTrendingDownIcon className="h-4 w-4 mr-1" />
                )}
                {stat.change}
              </div>
            </div>
            <div className="mt-4">
              <p className="stat-value">{stat.value.toLocaleString()}</p>
              <p className="stat-label">{stat.name}</p>
              <p className="text-xs text-gray-400 mt-1">{stat.subValue}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Loan Status Distribution */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">Loan Status Distribution</h3>
          </div>
          <div className="card-body">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={loanStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    fill="#8884d8"
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {loanStatusData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">Recent Transactions</h3>
          </div>
          <div className="card-body">
            <div className="space-y-4">
              {recentActivity?.map((activity: any, index: number) => (
                <div key={index} className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                      <BanknotesIcon className="h-4 w-4 text-primary-600" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {activity.entryNumber}
                    </p>
                    <p className="text-sm text-gray-500 truncate">
                      {activity.description}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(activity.totalDebit)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(activity.postedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
              {(!recentActivity || recentActivity.length === 0) && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No recent transactions
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-gray-900">Quick Actions</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {hasPermission('LOANS:CREATE') && (
              <a
                href="/loans/new"
                className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-primary-500 hover:bg-primary-50 transition-colors"
              >
                <BanknotesIcon className="h-8 w-8 text-primary-600" />
                <span className="mt-2 text-sm font-medium text-gray-900">New Loan</span>
              </a>
            )}
            {hasPermission('CUSTOMERS:CREATE') && (
              <a
                href="/customers?action=new"
                className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-primary-500 hover:bg-primary-50 transition-colors"
              >
                <UsersIcon className="h-8 w-8 text-primary-600" />
                <span className="mt-2 text-sm font-medium text-gray-900">New Customer</span>
              </a>
            )}
            {hasPermission('SAVINGS:DEPOSIT') && (
              <a
                href="/savings?action=deposit"
                className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-primary-500 hover:bg-primary-50 transition-colors"
              >
                <WalletIcon className="h-8 w-8 text-primary-600" />
                <span className="mt-2 text-sm font-medium text-gray-900">Deposit</span>
              </a>
            )}
            {hasPermission('ACCOUNTS:REPORTS_VIEW') && (
              <a
                href="/reports"
                className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-primary-500 hover:bg-primary-50 transition-colors"
              >
                <ClockIcon className="h-8 w-8 text-primary-600" />
                <span className="mt-2 text-sm font-medium text-gray-900">Reports</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
