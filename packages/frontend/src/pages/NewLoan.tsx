import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function NewLoan() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/loans')} className="btn-outline py-2"><ArrowLeftIcon className="h-4 w-4" /></button>
        <h1 className="text-2xl font-bold">New Loan Application</h1>
      </div>
      <div className="card p-6">
        <p className="text-gray-500">Loan application form will be implemented here with customer selection, product selection, amount, tenure, and other loan details.</p>
      </div>
    </div>
  );
}
