'use client';

import { useState, useEffect } from 'react';
import { BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getChartOfAccounts } from '@/actions/accounting.actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Account {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  isHeader: boolean;
  isActive: boolean;
  parent: { accountName: string; accountCode: string } | null;
}

// ---------------------------------------------------------------------------
// Color coding by account type
// ---------------------------------------------------------------------------

const ACCOUNT_TYPE_COLORS: Record<
  string,
  { bg: string; text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  ASSET: { bg: 'bg-blue-100 text-blue-800 border-blue-200', text: 'text-blue-700', variant: 'default' },
  LIABILITY: { bg: 'bg-red-100 text-red-800 border-red-200', text: 'text-red-700', variant: 'destructive' },
  EQUITY: { bg: 'bg-purple-100 text-purple-800 border-purple-200', text: 'text-purple-700', variant: 'secondary' },
  INCOME: { bg: 'bg-green-100 text-green-800 border-green-200', text: 'text-green-700', variant: 'default' },
  EXPENSE: { bg: 'bg-orange-100 text-orange-800 border-orange-200', text: 'text-orange-700', variant: 'default' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    setLoading(true);
    try {
      const data = await getChartOfAccounts();
      setAccounts(data as unknown as Account[]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load chart of accounts');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
          <BookOpen className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Accounts Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">General Ledger Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="font-medium">Loading accounts...</p>
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No accounts found</p>
              <p className="text-sm mt-1">No active chart of accounts configured</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account Code</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Account Type</TableHead>
                  <TableHead>Normal Balance</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead className="text-center">Is Header</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => {
                  const typeColor = ACCOUNT_TYPE_COLORS[account.accountType];
                  return (
                    <TableRow
                      key={account.id}
                      className={account.isHeader ? 'font-semibold bg-muted/30' : ''}
                    >
                      <TableCell className="font-mono text-sm">
                        {account.accountCode}
                      </TableCell>
                      <TableCell>
                        <span className={account.isHeader ? 'font-semibold' : ''}>
                          {account.accountName}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            typeColor?.bg || 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {account.accountType}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {account.normalBalance}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {account.parent
                          ? `${account.parent.accountCode} - ${account.parent.accountName}`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {account.isHeader ? (
                          <Badge variant="outline">Header</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">Postable</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={account.isActive ? 'success' : 'secondary'}>
                          {account.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
