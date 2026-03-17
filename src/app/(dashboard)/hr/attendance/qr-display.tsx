'use client';

import { useState, useTransition } from 'react';
import { QrCode, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { generateAttendanceQR } from '@/actions/hr.actions';

export function QRDisplay() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const generate = () => {
    startTransition(async () => {
      const result = await generateAttendanceQR();
      if (result.success && result.data) {
        setQrDataUrl(result.data.qrDataUrl);
        setDate(result.data.date);
      } else {
        toast.error(result.error || 'Failed to generate QR code');
      }
    });
  };

  const download = () => {
    if (!qrDataUrl || !date) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `attendance-qr-${date}.png`;
    link.click();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          Daily Attendance QR Code
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!qrDataUrl ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <p className="text-sm text-muted-foreground text-center">
              Generate today&apos;s QR code for staff to scan when clocking in. The code is valid for today only.
            </p>
            <Button onClick={generate} disabled={isPending}>
              {isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <QrCode className="mr-2 h-4 w-4" />
                  Generate QR Code
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <p className="text-xs text-muted-foreground">
              Date: <span className="font-medium">{date}</span>
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="Attendance QR Code"
              className="w-52 h-52 border rounded-lg shadow-sm"
            />
            <p className="text-xs text-center text-muted-foreground max-w-xs">
              Display this QR code at the office entrance. Staff scan it to clock in for the day.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={download}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
              <Button variant="outline" size="sm" onClick={generate} disabled={isPending}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
