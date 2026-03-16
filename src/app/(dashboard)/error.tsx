'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Dashboard Error]', error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">Something went wrong</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {error.message || 'An unexpected error occurred while loading this page.'}
          </p>
          {error.digest && (
            <p className="text-xs font-mono text-muted-foreground">
              Ref: {error.digest}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={reset} className="flex-1 gap-2" variant="default">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
            <Button asChild variant="outline" className="flex-1 gap-2">
              <Link href="/dashboard">
                <Home className="h-4 w-4" />
                Dashboard
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
