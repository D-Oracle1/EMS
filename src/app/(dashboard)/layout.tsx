import { Providers } from '@/components/providers';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { PWAInstallPrompt } from '@/components/pwa-install-prompt';
import { NotificationListener } from '@/components/notification-listener';
import { ServiceWorkerUpdater } from '@/components/sw-updater';

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
      <ServiceWorkerUpdater />
    </Providers>
  );
}
