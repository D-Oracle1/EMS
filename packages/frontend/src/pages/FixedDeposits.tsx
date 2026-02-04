import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';

export default function FixedDeposits() {
  const { data, isLoading } = useQuery({
    queryKey: ['fd-summary'],
    queryFn: async () => { const r = await api.get('/fixed-deposits/summary'); return r.data.data; },
  });
  if (isLoading) return <div className="flex justify-center p-8"><LoadingSpinner /></div>;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Fixed Deposits</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-6"><p className="stat-value">{data?.activeCount || 0}</p><p className="stat-label">Active FDs</p></div>
        <div className="card p-6"><p className="stat-value">{(data?.totalPrincipal || 0).toLocaleString()}</p><p className="stat-label">Total Principal (NGN)</p></div>
        <div className="card p-6"><p className="stat-value">{data?.maturingThisMonth || 0}</p><p className="stat-label">Maturing This Month</p></div>
      </div>
    </div>
  );
}
