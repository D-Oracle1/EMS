import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  PlusIcon,
  MinusIcon,
  DocumentPlusIcon,
  ArrowLeftIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

interface JournalLine {
  id: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  description: string;
  debit: number;
  credit: number;
}

export default function JournalEntry() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();

  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([
    { id: '1', accountId: '', description: '', debit: 0, credit: 0 },
    { id: '2', accountId: '', description: '', debit: 0, credit: 0 },
  ]);

  const { data: accounts } = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: async () => {
      const response = await api.get('/accounting/accounts?limit=500');
      return response.data.data;
    },
    enabled: hasPermission('ACCOUNTS:JOURNAL_CREATE'),
  });

  const createJournalEntry = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/accounting/journal-entries', data);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Journal entry created successfully');
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      navigate('/accounting/journal');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create journal entry');
    },
  });

  const addLine = () => {
    setLines([
      ...lines,
      { id: Date.now().toString(), accountId: '', description: '', debit: 0, credit: 0 },
    ]);
  };

  const removeLine = (id: string) => {
    if (lines.length > 2) {
      setLines(lines.filter((l) => l.id !== id));
    }
  };

  const updateLine = (id: string, field: keyof JournalLine, value: any) => {
    setLines(
      lines.map((l) => {
        if (l.id === id) {
          const updated = { ...l, [field]: value };
          // Clear credit if debit is entered and vice versa
          if (field === 'debit' && value > 0) {
            updated.credit = 0;
          } else if (field === 'credit' && value > 0) {
            updated.debit = 0;
          }
          // Update account info
          if (field === 'accountId') {
            const account = accounts?.find((a: any) => a.id === value);
            if (account) {
              updated.accountCode = account.code;
              updated.accountName = account.name;
            }
          }
          return updated;
        }
        return l;
      })
    );
  };

  const totalDebits = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredits = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01 && totalDebits > 0;
  const hasValidLines = lines.filter((l) => l.accountId && (l.debit > 0 || l.credit > 0)).length >= 2;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isBalanced) {
      toast.error('Journal entry must be balanced (debits must equal credits)');
      return;
    }

    if (!hasValidLines) {
      toast.error('Please add at least 2 valid lines with accounts and amounts');
      return;
    }

    const validLines = lines
      .filter((l) => l.accountId && (l.debit > 0 || l.credit > 0))
      .map((l) => ({
        accountId: l.accountId,
        description: l.description || description,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      }));

    createJournalEntry.mutate({
      entryDate,
      description,
      reference,
      lines: validLines,
    });
  };

  if (!hasPermission('ACCOUNTS:JOURNAL_CREATE')) {
    return (
      <div className="text-center py-12">
        <ExclamationTriangleIcon className="h-12 w-12 text-yellow-500 mx-auto" />
        <p className="mt-4 text-gray-500">You don't have permission to create journal entries.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="btn-outline py-2">
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Journal Entry</h1>
          <p className="text-gray-500">Create a manual double-entry journal transaction</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header Info */}
        <div className="card p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Entry Date *
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                required
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g., INV-001, ADJ-2024-001"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description *
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                placeholder="Brief description of the entry"
                className="input w-full"
              />
            </div>
          </div>
        </div>

        {/* Journal Lines */}
        <div className="card">
          <div className="card-header flex justify-between items-center">
            <h3 className="text-lg font-medium">Journal Lines</h3>
            <button type="button" onClick={addLine} className="btn-outline text-sm">
              <PlusIcon className="h-4 w-4 mr-1" />
              Add Line
            </button>
          </div>
          <div className="p-4 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500">
                  <th className="pb-3 min-w-[200px]">Account</th>
                  <th className="pb-3 min-w-[150px]">Description</th>
                  <th className="pb-3 w-32 text-right">Debit</th>
                  <th className="pb-3 w-32 text-right">Credit</th>
                  <th className="pb-3 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line, index) => (
                  <tr key={line.id}>
                    <td className="py-2">
                      <select
                        value={line.accountId}
                        onChange={(e) => updateLine(line.id, 'accountId', e.target.value)}
                        className="input w-full text-sm"
                      >
                        <option value="">Select account...</option>
                        {accounts?.map((acc: any) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} - {acc.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) => updateLine(line.id, 'description', e.target.value)}
                        placeholder="Line description"
                        className="input w-full text-sm"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        value={line.debit || ''}
                        onChange={(e) => updateLine(line.id, 'debit', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className="input w-full text-right text-sm font-mono"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        value={line.credit || ''}
                        onChange={(e) => updateLine(line.id, 'credit', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className="input w-full text-right text-sm font-mono"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        disabled={lines.length <= 2}
                        className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-50"
                      >
                        <MinusIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-medium">
                  <td colSpan={2} className="py-3 text-right">Totals:</td>
                  <td className="py-3 px-2 text-right font-mono">
                    {totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-2 text-right font-mono">
                    {totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Balance Status */}
          <div className="px-4 pb-4">
            <div
              className={clsx(
                'p-4 rounded-lg flex items-center gap-3',
                isBalanced ? 'bg-green-50' : 'bg-red-50'
              )}
            >
              {isBalanced ? (
                <>
                  <CheckCircleIcon className="h-5 w-5 text-green-600" />
                  <span className="text-green-800">Entry is balanced</span>
                </>
              ) : (
                <>
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
                  <span className="text-red-800">
                    Difference: {Math.abs(totalDebits - totalCredits).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    {totalDebits > totalCredits ? ' (Credits needed)' : ' (Debits needed)'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate(-1)} className="btn-outline">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isBalanced || !hasValidLines || createJournalEntry.isPending}
            className="btn-primary disabled:opacity-50"
          >
            <DocumentPlusIcon className="h-5 w-5 mr-2" />
            {createJournalEntry.isPending ? 'Creating...' : 'Create Journal Entry'}
          </button>
        </div>
      </form>
    </div>
  );
}
