import { redirect } from 'next/navigation';
import { Banknote, CheckCircle2, Hourglass, Users, UserPlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { formatCurrency } from '@/lib/utils';
import { getBusinessServicesDashboard } from '@/actions/business-services.actions';
import { ShareCustomerForms, MyReferrals } from '../my-forms/referrals';

/**
 * The Business Service Consultants / Social Media dashboard: the company
 * forms to share, a consultant's own clients, and for the department's heads,
 * the whole team.
 */
export default async function BusinessServicesPage() {
  const data = await getBusinessServicesDashboard();
  if (!data) redirect('/dashboard');
  const { totals, team } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Business Services</h1>
        <p className="text-muted-foreground">
          Share the company forms with your clients and follow what each application became. A savings form you
          share goes to the savings officer for approval, credited to you.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Clients referred" color="indigo" icon={UserPlus} value={totals.total}
          description={`${totals.thisMonth} this month`} />
        <StatCard title="With an officer" color="amber" icon={Hourglass} value={totals.awaiting}
          description="Awaiting approval or opening" />
        <StatCard title="Opened" color="emerald" icon={CheckCircle2} value={totals.opened}
          description={`${formatCurrency(totals.valueOpened)} opened`}
          progress={totals.total ? Math.round((totals.opened / totals.total) * 100) : undefined} />
        <StatCard title="Commission" color="teal" icon={Banknote} value={formatCurrency(totals.commissionOwed)}
          description={`owed · ${formatCurrency(totals.commissionPaid)} paid`} />
      </div>

      <ShareCustomerForms links={data.links} title="Company forms" />

      {data.referrals.length > 0 ? (
        <MyReferrals referrals={data.referrals} />
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No clients yet. Share a form, and every application through it shows here.
          </CardContent>
        </Card>
      )}

      {team && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-indigo-600" />Team ({team.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {team.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No staff are in the department yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium sm:px-6">Consultant</th>
                      <th className="px-4 py-2 text-right font-medium">Referred</th>
                      <th className="px-4 py-2 text-right font-medium">This month</th>
                      <th className="px-4 py-2 text-right font-medium">With an officer</th>
                      <th className="px-4 py-2 text-right font-medium sm:pr-6">Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((m) => (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="px-4 py-2.5 sm:px-6">
                          <p className="font-medium">{m.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{m.employeeId}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{m.total}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{m.thisMonth}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{m.awaiting}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium sm:pr-6">{m.opened}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
