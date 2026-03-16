import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileQuestion, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex flex-col items-center gap-3">
            <FileQuestion className="h-12 w-12 text-muted-foreground" />
            <CardTitle className="text-2xl">404 — Page Not Found</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The page you are looking for does not exist or has been moved.
          </p>
          <Button asChild className="w-full gap-2">
            <Link href="/dashboard">
              <Home className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
