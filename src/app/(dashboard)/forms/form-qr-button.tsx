'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Download, Loader2, Printer, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { shareUrl } from './form-bits';

const NAVY = '#002078';

interface FormQrButtonProps {
  slug: string;
  title: string;
  /** "icon" for a form card; "full" shows the words QR code beside it. */
  variant?: 'icon' | 'full';
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** The QR alone, with the brand mark set in a white disc at its centre. */
async function brandedQr(url: string, size: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  // High error correction: up to ~30% of the code can be covered and it still scans.
  await QRCode.toCanvas(canvas, url, { width: size, margin: 1, errorCorrectionLevel: 'H', color: { dark: NAVY, light: '#ffffff' } });
  try {
    const mark = await loadImage('/brand/mark.png');
    const ctx = canvas.getContext('2d')!;
    const disc = size * 0.22;
    const c = size / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c, c, disc / 2 + size * 0.015, 0, Math.PI * 2);
    ctx.fill();
    const w = disc * 0.82;
    const h = (mark.height / mark.width) * w;
    ctx.drawImage(mark, c - w / 2, c - h / 2, w, h);
  } catch {
    // No mark: a plain code scans just as well.
  }
  return canvas;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

/** A portrait poster: logo, the form's title, the code, how to use it and the link. */
async function poster(url: string, title: string): Promise<string> {
  const W = 1080;
  const H = 1800;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const font = 'Inter, "Segoe UI", Roboto, Arial, sans-serif';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, 18);

  let y = 90;
  try {
    const logo = await loadImage('/brand/logo.png');
    const lw = 360;
    const lh = (logo.height / logo.width) * lw;
    ctx.drawImage(logo, (W - lw) / 2, y, lw, lh);
    y += lh + 110;
  } catch {
    y += 40;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 58px ${font}`;
  for (const line of wrap(ctx, title, W - 160)) {
    ctx.fillText(line, W / 2, y);
    y += 72;
  }

  y += 20;
  const qrSize = 620;
  const qr = await brandedQr(url, qrSize);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect((W - qrSize) / 2 - 30, y - 30, qrSize + 60, qrSize + 60, 36);
  ctx.stroke();
  ctx.drawImage(qr, (W - qrSize) / 2, y);
  y += qrSize + 100;

  ctx.fillStyle = NAVY;
  ctx.font = `600 40px ${font}`;
  ctx.fillText('Scan with your phone camera to fill in', W / 2, y);
  y += 60;
  // Monospace for the link: Inter turns the x in "9x2" into a multiplication
  // sign, and someone typing the link by hand would copy it wrong.
  ctx.fillStyle = '#64748b';
  ctx.font = `400 30px Consolas, "Courier New", monospace`;
  ctx.fillText(url.replace(/^https?:\/\//, ''), W / 2, y);
  y += 80;

  // Trim the canvas to what was drawn, so the poster has no empty tail.
  const out = document.createElement('canvas');
  out.width = W;
  out.height = Math.min(H, Math.ceil(y));
  out.getContext('2d')!.drawImage(canvas, 0, 0);
  return out.toDataURL('image/png');
}

const fileName = (title: string) =>
  `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'form'}-qr.png`;

/** Shows a form's link as a QR code, to scan from a screen, download or print as a poster. */
export function FormQrButton({ slug, title, variant = 'icon' }: FormQrButtonProps) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    poster(shareUrl(slug), title)
      .then((src) => { if (live) setImage(src); })
      .catch(() => { if (live) toast.error('Could not make the QR code'); });
    return () => { live = false; };
  }, [open, slug, title]);

  const download = () => {
    if (!image) return;
    const a = document.createElement('a');
    a.href = image;
    a.download = fileName(title);
    a.click();
  };

  const print = () => {
    if (!image) return;
    setBusy(true);
    const win = window.open('', '_blank', 'width=800,height=1000');
    if (!win) {
      setBusy(false);
      return toast.error('Allow pop-ups to print, or download the image and print that.');
    }
    win.document.write(
      `<!doctype html><title>${title.replace(/</g, '&lt;')}</title>` +
      '<style>@page{margin:12mm}html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center}' +
      'img{max-width:100%;max-height:100vh}</style>' +
      `<img src="${image}" onload="setTimeout(function(){window.print();window.close()},150)">`
    );
    win.document.close();
    setBusy(false);
  };

  return (
    <>
      <Button
        size={variant === 'icon' ? 'sm' : 'default'}
        variant="secondary"
        className="shrink-0"
        onClick={() => setOpen(true)}
        title="QR code"
        aria-label="QR code"
      >
        <QrCode className={variant === 'icon' ? 'h-3.5 w-3.5' : 'mr-2 h-4 w-4'} />
        {variant === 'full' && 'QR code'}
      </Button>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setImage(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>QR code</DialogTitle>
            <DialogDescription>Anyone can scan this with their phone camera to open the form.</DialogDescription>
          </DialogHeader>

          <div className="flex justify-center rounded-2xl border bg-white p-2">
            {image ? (
              // A data URL made on this page: next/image adds nothing here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={`QR code for ${title}`} className="h-auto w-full max-w-sm" />
            ) : (
              <div className="flex aspect-[4/5] w-full max-w-sm items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={download} disabled={!image}>
              <Download className="mr-2 h-4 w-4" />Download
            </Button>
            <Button onClick={print} disabled={!image || busy}>
              <Printer className="mr-2 h-4 w-4" />Print poster
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
