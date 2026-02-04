import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DocumentChartBarIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  UsersIcon,
  ArrowDownTrayIcon,
  CalendarIcon,
  FunnelIcon,
  ChartPieIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

type ReportType = 'trial-balance' | 'loan-portfolio' | 'loan-aging' | 'savings-summary' | 'fixed-deposit-summary' | 'customer-statement';

const reports = [
  {
    id: 'trial-balance' as ReportType,
    name: 'Trial Balance',
    desc: 'Chart of accounts with balances',
    icon: DocumentChartBarIcon,
    color: 'bg-blue-500',
  },
  {
    id: 'loan-portfolio' as ReportType,
    name: 'Loan Portfolio',
    desc: 'Active loans and performance',
    icon: CurrencyDollarIcon,
    color: 'bg-green-500',
  },
  {
    id: 'loan-aging' as ReportType,
    name: 'Loan Aging',
    desc: 'Overdue loans by aging bucket',
    icon: ChartPieIcon,
    color: 'bg-red-500',
  },
  {
    id: 'savings-summary' as ReportType,
    name: 'Savings Summary',
    desc: 'Savings accounts overview',
    icon: BuildingOfficeIcon,
    color: 'bg-purple-500',
  },
  {
    id: 'fixed-deposit-summary' as ReportType,
    name: 'Fixed Deposits',
    desc: 'FD portfolio summary',
    icon: DocumentTextIcon,
    color: 'bg-yellow-500',
  },
  {
    id: 'customer-statement' as ReportType,
    name: 'Customer Statement',
    desc: 'Individual customer transactions',
    icon: UsersIcon,
    color: 'bg-indigo-500',
  },
];

export default function Reports() {
  const { hasPermission } = useAuth();
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [filters, setFilters] = useState({
    asOfDate: new Date().toISOString().split('T')[0],
    startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    branchId: '',
    customerId: '',
  });
  const [isExporting, setIsExporting] = useState(false);

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['report', selectedReport, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedReport === 'trial-balance') {
        params.append('asOfDate', filters.asOfDate);
      }
      if (selectedReport === 'customer-statement') {
        params.append('customerId', filters.customerId);
        params.append('startDate', filters.startDate);
        params.append('endDate', filters.endDate);
      }
      if (filters.branchId) {
        params.append('branchId', filters.branchId);
      }
      const response = await api.get('/reports/' + selectedReport + '?' + params.toString());
      return response.data.data;
    },
    enabled: !!selectedReport && hasPermission('ACCOUNTS:REPORTS_VIEW'),
  });

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const response = await api.get('/staff/branches');
      return response.data.data;
    },
  });

  const handleExport = async (format: 'csv' | 'excel') => {
    if (!selectedReport) return;

    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      params.append('format', format);
      if (selectedReport === 'trial-balance') {
        params.append('asOfDate', filters.asOfDate);
      }
      if (selectedReport === 'customer-statement') {
        params.append('customerId', filters.customerId);
        params.append('startDate', filters.startDate);
        params.append('endDate', filters.endDate);
      }
      if (filters.branchId) {
        params.append('branchId', filters.branchId);
      }

      const response = await api.get('/reports/' + selectedReport + '/export?' + params.toString(), {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: response.headers['content-type'] });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = selectedReport + '-' + new Date().toISOString().split('T')[0] + '.' + format;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Report exported successfully');
    } catch (error: any) {
      toast.error('Failed to export report');
    } finally {
      setIsExporting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (!hasPermission('ACCOUNTS:REPORTS_VIEW')) {
    return (
      <div className="text-center py-12">
        <DocumentChartBarIcon className="h-12 w-12 text-gray-400 mx-auto" />
        <p className="mt-4 text-gray-500">You don't have permission to view reports.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-500">Generate and export financial reports</p>
      </div>

      {/* Report Selection */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {reports.map((report) => (
          <button
            key={report.id}
            onClick={() => setSelectedReport(report.id)}
            className={clsx(
              'card p-4 text-left transition-all',
              selectedReport === report.id
                ? 'ring-2 ring-primary-500 border-primary-500'
                : 'hover:border-gray-300'
            )}
          >
            <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', report.color)}>
              <report.icon className="h-5 w-5 text-white" />
            </div>
            <h3 className="mt-3 font-medium text-sm">{report.name}</h3>
            <p className="text-xs text-gray-500 mt-1">{report.desc}</p>
          </button>
        ))}
      </div>

      {/* Report Viewer */}
      {selectedReport && (
        <div className="card">
          {/* Report Header & Filters */}
          <div className="card-header flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <FunnelIcon className="h-5 w-5 text-gray-400" />
              <h3 className="font-medium">
                {reports.find((r) => r.id === selectedReport)?.name}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {selectedReport === 'trial-balance' && (
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-gray-400" />
                  <input
                    type="date"
                    value={filters.asOfDate}
                    onChange={(e) => setFilters({ ...filters, asOfDate: e.target.value })}
                    className="input py-1 text-sm"
                  />
                </div>
              )}
              {selectedReport === 'customer-statement' && (
                <>
                  <input
                    type="text"
                    placeholder="Customer ID"
                    value={filters.customerId}
                    onChange={(e) => setFilters({ ...filters, customerId: e.target.value })}
                    className="input py-1 text-sm w-40"
                  />
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                    className="input py-1 text-sm"
                  />
                  <span className="text-gray-400">to</span>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                    className="input py-1 text-sm"
                  />
                </>
              )}
              {['loan-portfolio', 'savings-summary', 'fixed-deposit-summary'].includes(selectedReport) && (
                <select
                  value={filters.branchId}
                  onChange={(e) => setFilters({ ...filters, branchId: e.target.value })}
                  className="input py-1 text-sm"
                >
                  <option value="">All Branches</option>
                  {branches?.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => handleExport('csv')}
                  disabled={isExporting}
                  className="btn-outline py-1 px-3 text-sm"
                >
                  <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
                  CSV
                </button>
              </div>
            </div>
          </div>

          {/* Report Content */}
          <div className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <LoadingSpinner size="lg" />
              </div>
            ) : reportData ? (
              <div className="overflow-x-auto">
                {/* Trial Balance */}
                {selectedReport === 'trial-balance' && (
                  <>
                    <table className="table w-full">
                      <thead>
                        <tr>
                          <th>Account Code</th>
                          <th>Account Name</th>
                          <th>Type</th>
                          <th className="text-right">Debit</th>
                          <th className="text-right">Credit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {reportData.accounts?.map((acc: any) => (
                          <tr key={acc.accountCode}>
                            <td className="font-mono">{acc.accountCode}</td>
                            <td>{acc.accountName}</td>
                            <td className="text-sm text-gray-500">{acc.accountType}</td>
                            <td className="text-right font-mono">
                              {acc.debitBalance ? formatCurrency(acc.debitBalance) : ''}
                            </td>
                            <td className="text-right font-mono">
                              {acc.creditBalance ? formatCurrency(acc.creditBalance) : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 font-medium">
                        <tr>
                          <td colSpan={3} className="text-right">Totals:</td>
                          <td className="text-right font-mono">{formatCurrency(reportData.totals?.debit || 0)}</td>
                          <td className="text-right font-mono">{formatCurrency(reportData.totals?.credit || 0)}</td>
                        </tr>
                      </tfoot>
                    </table>
                    {reportData.isBalanced === false && (
                      <div className="mt-4 p-4 bg-red-50 text-red-800 rounded-lg">
                        Warning: Trial balance is not balanced!
                      </div>
                    )}
                  </>
                )}

                {/* Loan Portfolio */}
                {selectedReport === 'loan-portfolio' && (
                  <>
                    <div className="grid grid-cols-4 gap-4 mb-6">
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-500">Total Loans</p>
                        <p className="text-2xl font-bold">{reportData.summary?.totalLoans || 0}</p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-500">Total Principal</p>
                        <p className="text-2xl font-bold">{formatCurrency(reportData.summary?.totalPrincipal || 0)}</p>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-500">Active Loans</p>
                        <p className="text-2xl font-bold text-green-600">{reportData.summary?.activeLoans || 0}</p>
                      </div>
                      <div className="bg-red-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-500">Overdue Loans</p>
                        <p className="text-2xl font-bold text-red-600">{reportData.summary?.overdueLoans || 0}</p>
                      </div>
                    </div>
                    <table className="table w-full">
                      <thead>
                        <tr>
                          <th>Loan #</th>
                          <th>Customer</th>
                          <th>Product</th>
                          <th className="text-right">Principal</th>
                          <th>Rate</th>
                          <th>Tenure</th>
                          <th>Status</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {reportData.loans?.map((loan: any) => (
                          <tr key={loan.loanNumber}>
                            <td className="font-mono">{loan.loanNumber}</td>
                            <td>{loan.customerName}</td>
                            <td>{loan.productName}</td>
                            <td className="text-right font-mono">{formatCurrency(loan.principal)}</td>
                            <td>{loan.interestRate}%</td>
                            <td>{loan.tenure} mo</td>
                            <td>
                              <span className={clsx(
                                'badge',
                                loan.status === 'ACTIVE' ? 'badge-success' :
                                loan.status === 'OVERDUE' ? 'badge-danger' : 'badge-warning'
                              )}>
                                {loan.status}
                              </span>
                            </td>
                            <td className="text-sm">{new Date(loan.applicationDate).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {/* Loan Aging */}
                {selectedReport === 'loan-aging' && (
                  <>
                    <div className="grid grid-cols-5 gap-4 mb-6">
                      {['1-30', '31-60', '61-90', '91-180', '180+'].map((bucket) => (
                        <div key={bucket} className="bg-gray-50 p-4 rounded-lg text-center">
                          <p className="text-sm text-gray-500">{bucket} Days</p>
                          <p className="text-xl font-bold">
                            {reportData.byBucket?.[bucket]?.count || 0}
                          </p>
                          <p className="text-sm text-gray-500">
                            {formatCurrency(reportData.byBucket?.[bucket]?.amount || 0)}
                          </p>
                        </div>
                      ))}
                    </div>
                    <table className="table w-full">
                      <thead>
                        <tr>
                          <th>Loan #</th>
                          <th>Customer</th>
                          <th>Phone</th>
                          <th>Due Date</th>
                          <th className="text-right">Days Overdue</th>
                          <th>Bucket</th>
                          <th className="text-right">Outstanding</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {reportData.overdueLoans?.map((item: any, i: number) => (
                          <tr key={i}>
                            <td className="font-mono">{item.loanNumber}</td>
                            <td>{item.customerName}</td>
                            <td>{item.phone}</td>
                            <td>{new Date(item.dueDate).toLocaleDateString()}</td>
                            <td className="text-right">{item.daysOverdue}</td>
                            <td>
                              <span className={clsx(
                                'badge',
                                item.bucket === '180+' ? 'badge-danger' :
                                item.bucket === '91-180' ? 'badge-warning' : 'badge-gray'
                              )}>
                                {item.bucket}
                              </span>
                            </td>
                            <td className="text-right font-mono">{formatCurrency(item.outstanding)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {/* Savings Summary */}
                {selectedReport === 'savings-summary' && (
                  <>
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-500">Total Accounts</p>
                        <p className="text-2xl font-bold">{reportData.summary?.totalAccounts || 0}</p>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-500">Active Accounts</p>
                        <p className="text-2xl font-bold text-green-600">{reportData.summary?.activeAccounts || 0}</p>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-500">Total Balance</p>
                        <p className="text-2xl font-bold text-blue-600">{formatCurrency(reportData.summary?.totalBalance || 0)}</p>
                      </div>
                    </div>
                    <table className="table w-full">
                      <thead>
                        <tr>
                          <th>Account #</th>
                          <th>Customer</th>
                          <th>Product</th>
                          <th>Type</th>
                          <th className="text-right">Balance</th>
                          <th>Status</th>
                          <th>Opened</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {reportData.accounts?.map((acc: any) => (
                          <tr key={acc.accountNumber}>
                            <td className="font-mono">{acc.accountNumber}</td>
                            <td>{acc.customerName}</td>
                            <td>{acc.productName}</td>
                            <td>{acc.savingsType}</td>
                            <td className="text-right font-mono">{formatCurrency(acc.balance)}</td>
                            <td>
                              <span className={clsx('badge', acc.status === 'ACTIVE' ? 'badge-success' : 'badge-gray')}>
                                {acc.status}
                              </span>
                            </td>
                            <td className="text-sm">{new Date(acc.openedAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {/* Fixed Deposit Summary */}
                {selectedReport === 'fixed-deposit-summary' && (
                  <>
                    <div className="grid grid-cols-4 gap-4 mb-6">
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-500">Total Deposits</p>
                        <p className="text-2xl font-bold">{reportData.summary?.totalDeposits || 0}</p>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-500">Active</p>
                        <p className="text-2xl font-bold text-green-600">{reportData.summary?.activeDeposits || 0}</p>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-500">Total Principal</p>
                        <p className="text-2xl font-bold text-blue-600">{formatCurrency(reportData.summary?.totalPrincipal || 0)}</p>
                      </div>
                      <div className="bg-yellow-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-500">Total Interest</p>
                        <p className="text-2xl font-bold text-yellow-600">{formatCurrency(reportData.summary?.totalInterest || 0)}</p>
                      </div>
                    </div>
                    <table className="table w-full">
                      <thead>
                        <tr>
                          <th>Certificate #</th>
                          <th>Customer</th>
                          <th className="text-right">Principal</th>
                          <th>Rate</th>
                          <th>Tenure</th>
                          <th className="text-right">Interest</th>
                          <th className="text-right">Maturity Amt</th>
                          <th>Maturity Date</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {reportData.deposits?.map((fd: any) => (
                          <tr key={fd.certificateNumber}>
                            <td className="font-mono">{fd.certificateNumber}</td>
                            <td>{fd.customerName}</td>
                            <td className="text-right font-mono">{formatCurrency(fd.principal)}</td>
                            <td>{fd.rate}%</td>
                            <td>{fd.tenure} days</td>
                            <td className="text-right font-mono">{formatCurrency(fd.interest)}</td>
                            <td className="text-right font-mono">{formatCurrency(fd.maturityAmount)}</td>
                            <td className="text-sm">{new Date(fd.maturityDate).toLocaleDateString()}</td>
                            <td>
                              <span className={clsx('badge', fd.status === 'ACTIVE' ? 'badge-success' : 'badge-gray')}>
                                {fd.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {/* Customer Statement */}
                {selectedReport === 'customer-statement' && filters.customerId && (
                  <>
                    {reportData.customer && (
                      <div className="bg-gray-50 p-4 rounded-lg mb-6">
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-sm text-gray-500">Customer Name</p>
                            <p className="font-medium">{reportData.customer.name}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Customer Number</p>
                            <p className="font-medium">{reportData.customer.customerNumber}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Phone</p>
                            <p className="font-medium">{reportData.customer.phone}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    <table className="table w-full">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Account/Loan</th>
                          <th>Reference</th>
                          <th className="text-right">Credit</th>
                          <th className="text-right">Debit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {reportData.transactions?.map((txn: any, i: number) => (
                          <tr key={i}>
                            <td>{new Date(txn.date).toLocaleDateString()}</td>
                            <td>{txn.type}</td>
                            <td className="font-mono">{txn.accountNumber}</td>
                            <td className="font-mono">{txn.reference}</td>
                            <td className="text-right font-mono text-green-600">
                              {txn.credit ? formatCurrency(txn.credit) : ''}
                            </td>
                            <td className="text-right font-mono text-red-600">
                              {txn.debit ? formatCurrency(txn.debit) : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                {selectedReport === 'customer-statement' && !filters.customerId
                  ? 'Enter a customer ID to view statement'
                  : 'No data available for the selected report'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
