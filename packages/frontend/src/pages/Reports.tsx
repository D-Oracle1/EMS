import { Link } from 'react-router-dom';
import { DocumentChartBarIcon, DocumentTextIcon, CurrencyDollarIcon, UsersIcon } from '@heroicons/react/24/outline';

const reports = [
  { name: 'Trial Balance', desc: 'View trial balance report', icon: DocumentChartBarIcon, href: '#trial-balance' },
  { name: 'Income Statement', desc: 'Profit and loss statement', icon: CurrencyDollarIcon, href: '#income' },
  { name: 'Balance Sheet', desc: 'Assets, liabilities, equity', icon: DocumentTextIcon, href: '#balance' },
  { name: 'Loan Portfolio', desc: 'Loan performance analysis', icon: DocumentChartBarIcon, href: '#loans' },
  { name: 'Customer Statement', desc: 'Individual customer reports', icon: UsersIcon, href: '#customer' },
];

export default function Reports() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((r) => (
          <a key={r.name} href={r.href} className="card p-6 hover:border-primary-500 transition-colors">
            <r.icon className="h-8 w-8 text-primary-600" />
            <h3 className="mt-4 font-medium">{r.name}</h3>
            <p className="text-sm text-gray-500">{r.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
