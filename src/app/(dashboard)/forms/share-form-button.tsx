'use client';

import { useState } from 'react';
import { Link2, Mail, MessageCircle, MessageSquareText, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { copyShareLink, shareUrl } from './form-bits';

interface ShareFormButtonProps {
  slug: string;
  title: string;
  /** "icon" for a form card; "full" shows the word Share beside it. */
  variant?: 'icon' | 'full';
}

/**
 * Shares a form's link. On a phone it opens the phone's own share sheet, so
 * the link goes straight into WhatsApp, SMS, email or any installed app.
 * Where the browser has no share sheet, a small menu offers WhatsApp, email,
 * SMS and copying the link.
 */
export function ShareFormButton({ slug, title, variant = 'icon' }: ShareFormButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const message = () => `Please fill in this form: ${title}`;

  const share = async () => {
    const url = shareUrl(slug);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: message(), url });
        return;
      } catch (error) {
        // Closing the sheet is not a failure; anything else falls back to the menu.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    setMenuOpen(true);
  };

  const open = (href: string) => window.open(href, '_blank', 'noopener,noreferrer');
  const text = () => `${message()}\n${shareUrl(slug)}`;

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          size={variant === 'icon' ? 'sm' : 'default'}
          variant="secondary"
          title="Share form"
          aria-label="Share form"
          className="shrink-0"
          // The trigger would toggle the menu itself; the share sheet comes first.
          onPointerDown={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              share();
            }
          }}
          onClick={(e) => {
            e.preventDefault();
            share();
          }}
        >
          <Share2 className={variant === 'icon' ? 'h-3.5 w-3.5' : 'mr-2 h-4 w-4'} />
          {variant === 'full' && 'Share'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Share form</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => open(`https://wa.me/?text=${encodeURIComponent(text())}`)}>
          <MessageCircle className="mr-2 h-4 w-4 text-emerald-600" />WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => { window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text())}`; }}
        >
          <Mail className="mr-2 h-4 w-4 text-sky-600" />Email
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { window.location.href = `sms:?&body=${encodeURIComponent(text())}`; }}>
          <MessageSquareText className="mr-2 h-4 w-4 text-indigo-600" />SMS
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => copyShareLink(slug)}>
          <Link2 className="mr-2 h-4 w-4" />Copy link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
