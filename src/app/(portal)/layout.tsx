import { Providers } from '@/components/providers';
import { PortalShell } from '@/components/portal/portal-shell';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <PortalShell>{children}</PortalShell>
    </Providers>
  );
}
