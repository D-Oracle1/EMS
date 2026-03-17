'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QRScannerProps {
  onScan: (token: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const scannerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const html5QrCode = new Html5Qrcode('qr-reader-container');
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            if (stopped) return;
            stopped = true;
            html5QrCode.stop().catch(() => {});
            onScan(decodedText);
          },
          () => { /* ignore per-frame decode errors */ }
        );
      } catch (err: any) {
        if (!stopped) {
          setError(err?.message || 'Could not access camera. Please allow camera permissions and try again.');
        }
      }
    }

    startScanner();

    return () => {
      stopped = true;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Scan Attendance QR Code</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="p-4">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Camera className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-red-600">{error}</p>
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : (
            <>
              {/* html5-qrcode mounts the video element inside this div */}
              <div id="qr-reader-container" className="w-full rounded overflow-hidden" />
              <p className="text-xs text-center text-muted-foreground mt-3">
                Point your camera at the attendance QR code displayed at the office entrance
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
