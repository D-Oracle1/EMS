import { Providers } from '@/components/providers';
import { PortalShell } from '@/components/portal/portal-shell';
import { BalancePrivacy } from '@/components/portal/balance-privacy';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <BalancePrivacy>
        <PortalShell>{children}</PortalShell>
      </BalancePrivacy>
    </Providers>
  );
}
