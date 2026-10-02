/**
 * The tinted icon tile for a palette colour name (the `color` on a nav entry,
 * a card's tint, ...).
 *
 * Every class is spelled out in full here on purpose. The .icon-tile-* rules
 * live in globals.css inside @layer components, and Tailwind drops any rule
 * there whose class name never appears literally in the scanned source
 * (src/components, src/app). A name assembled at runtime - `icon-tile-${c}` -
 * does not count, so a colour used only that way rendered as a bare icon with
 * no tile, a different size from its neighbours. This file must stay under
 * src/components so Tailwind scans it.
 *
 * Names without a tile of their own fold into the nearest one.
 */
const ICON_TILE: Record<string, string> = {
  blue: 'icon-tile-blue',
  orange: 'icon-tile-orange',
  emerald: 'icon-tile-emerald',
  violet: 'icon-tile-violet',
  cyan: 'icon-tile-cyan',
  amber: 'icon-tile-amber',
  rose: 'icon-tile-rose',
  sky: 'icon-tile-sky',
  indigo: 'icon-tile-indigo',
  slate: 'icon-tile-slate',
  teal: 'icon-tile-teal',
  purple: 'icon-tile-purple',
  fuchsia: 'icon-tile-fuchsia',
  pink: 'icon-tile-pink',
  yellow: 'icon-tile-amber',
  gold: 'icon-tile-amber',
  gray: 'icon-tile-slate',
};

export function iconTileClass(color: string | undefined): string {
  return (color && ICON_TILE[color]) || 'icon-tile-slate';
}
