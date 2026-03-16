'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  BellOff,
  CheckCheck,
  RefreshCw,
  AlertTriangle,
  Info,
  AlertCircle,
  Clock,
  CreditCard,
  ClipboardCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from '@/actions/notification.actions';
import { formatDateTime } from '@/lib/utils';
import type { SessionUser } from '@/types';

interface NotificationsClientProps {
  user: SessionUser;
}

const typeIcons: Record<string, React.ReactNode> = {
  INFO: <Info className="h-5 w-5 text-blue-500" />,
  WARNING: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  ERROR: <AlertCircle className="h-5 w-5 text-red-500" />,
  APPROVAL_REQUIRED: <ClipboardCheck className="h-5 w-5 text-purple-500" />,
  TASK_ASSIGNED: <Clock className="h-5 w-5 text-orange-500" />,
  PAYMENT_RECEIVED: <CreditCard className="h-5 w-5 text-green-500" />,
  LOAN_OVERDUE: <AlertTriangle className="h-5 w-5 text-red-500" />,
  MATURITY_REMINDER: <Bell className="h-5 w-5 text-blue-500" />,
};

export function NotificationsClient({ user }: NotificationsClientProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isPending, startTransition] = useTransition();

  const fetchNotifications = () => {
    startTransition(async () => {
      try {
        const data = await getNotifications(100);
        setNotifications(data);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load notifications');
      }
    });
  };

  useEffect(() => {
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMarkRead = (id: string) => {
    startTransition(async () => {
      await markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date() } : n))
      );
    });
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      await markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: new Date() })));
      toast.success('All notifications marked as read');
    });
  };

  const handleClick = (notification: any) => {
    if (!notification.isRead) handleMarkRead(notification.id);
    if (notification.actionUrl) router.push(notification.actionUrl);
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchNotifications} disabled={isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={isPending}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Mark All Read
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            All Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BellOff className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p>{isPending ? 'Loading...' : 'No notifications yet'}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-4 p-4 rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${
                    !n.isRead ? 'bg-muted/30 border-l-4 border-primary' : ''
                  }`}
                  onClick={() => handleClick(n)}
                >
                  <div className="mt-0.5">
                    {typeIcons[n.type] || <Bell className="h-5 w-5 text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm ${!n.isRead ? 'font-semibold' : 'font-medium'}`}>
                        {n.title}
                      </p>
                      <Badge variant={n.isRead ? 'secondary' : 'default'} className="text-xs">
                        {n.type.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDateTime(n.createdAt)}
                      {n.isRead && n.readAt && ` · Read ${formatDateTime(n.readAt)}`}
                    </p>
                  </div>
                  {!n.isRead && (
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
