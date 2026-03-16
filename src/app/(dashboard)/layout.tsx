import { Providers } from '@/components/providers';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { PWAInstallPrompt } from '@/components/pwa-install-prompt';
import { NotificationListener } from '@/components/notification-listener';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <DashboardShell>{children}</DashboardShell>
      <PWAInstallPrompt />
      <NotificationListener />
    </Providers>
  );
}
