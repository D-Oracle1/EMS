/**
 * The opening splash, shown only when the installed app (the PWA) is opened:
 * never in a browser tab, so a customer opening a form link or a page in a
 * browser goes straight to it, and never again while the app is in use.
 *
 * The effect: the Hy-Link mark dips, pops and settles while one soft glow
 * ring pulses out from behind it, then the screen fades into the app. About
 * 1.8 seconds.
 *
 * Its first frame is exactly the static iOS launch screen in public/splash
 * (mark 64px, 8px gap, name 22px, tagline 11px, the doodle pattern at 6%), so
 * the hand-over from the operating system is seamless. That is why the name
 * and tagline stay still: the launch screen already shows them, and fading
 * them in would make them blink out first.
 *
 * Hidden unless a tiny inline script, run while the HTML is parsed and before
 * the overlay paints, finds the page running as an installed app
 * (display-mode standalone, fullscreen or minimal-ui, or iOS's
 * navigator.standalone) for the first time this session. The session flag
 * means a reload or a later page load inside the running app skips it;
 * closing the app and opening it again shows it.
 *
 * Pure CSS animation, so it plays from the first paint, before React
 * hydrates; it hides itself when done (visibility: hidden, no pointer
 * events). Respects prefers-reduced-motion. Rendered once, high in the root
 * layout's <body>.
 */

const MARK_SRC = '/brand/mark.png';
const PATTERN_SRC: string | null = '/brand/pattern.jpg';
const NAME = 'Hy-Link Finance';
const TAGLINE = 'Your Financial Future, Secured';
const NAVY = '#002078';
const SLATE = '#475569';
const GLOW = '42,120,214'; // the brand blue, as r,g,b for the ring's alpha

const SIZE = 64; // px, the mark, as on the launch screen

// Timeline (ms after first paint).
const HOLD = 150; // the launch screen's frame, unchanged
const POP_FOR = 650; // dip, pop, settle
const RING_AT = HOLD + 200; // the ring leaves as the mark pops
const RING_FOR = 800;
const FADE_AT = 1400;
const FADE_FOR = 400;
const SESSION_KEY = 'hl-splash';

const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

const CSS = `
.hl-splash{display:none}
html[data-splash="show"] .hl-splash{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fff;
  animation:hl-out ${FADE_FOR}ms ease-in ${FADE_AT}ms forwards;pointer-events:auto}
${PATTERN_SRC ? `.hl-splash::before{content:"";position:absolute;inset:0;background:url(${PATTERN_SRC}) repeat;background-size:360px 360px;opacity:.06;pointer-events:none}` : ''}
.hl-splash>*{position:relative}
.hl-splash__mark{position:relative;width:${SIZE}px;height:${SIZE}px}
.hl-splash__mark img{position:relative;z-index:1;display:block;width:${SIZE}px;height:${SIZE}px;
  animation:hl-pop ${POP_FOR}ms cubic-bezier(.3,0,.2,1) ${HOLD}ms both}
.hl-splash__ring{position:absolute;left:50%;top:50%;width:${SIZE}px;height:${SIZE}px;margin:-${SIZE / 2}px 0 0 -${SIZE / 2}px;border-radius:50%;
  background:radial-gradient(circle,rgba(${GLOW},.28) 0%,rgba(${GLOW},.12) 45%,rgba(${GLOW},0) 70%);
  box-shadow:0 0 0 2px rgba(${GLOW},.35);opacity:0;
  animation:hl-ring ${RING_FOR}ms cubic-bezier(.2,.7,.3,1) ${RING_AT}ms both}
.hl-splash__name{margin:8px 0 0;font:700 22px/1.2 ${FONT};letter-spacing:-.01em;color:${NAVY};white-space:nowrap}
.hl-splash__tagline{margin:3px 0 0;font:400 11px/1.4 ${FONT};letter-spacing:.01em;color:${SLATE};white-space:nowrap;text-align:center}
@keyframes hl-pop{0%{transform:scale(1)}25%{transform:scale(.9)}60%{transform:scale(1.1)}100%{transform:scale(1)}}
@keyframes hl-ring{0%{opacity:.9;transform:scale(.8)}100%{opacity:0;transform:scale(2.6)}}
@keyframes hl-out{to{opacity:0;visibility:hidden;pointer-events:none}}
@media (prefers-reduced-motion:reduce){
  .hl-splash__mark img,.hl-splash__ring{animation:none}
  .hl-splash__ring{display:none}
  html[data-splash="show"] .hl-splash{animation:hl-out .3s ease-in .8s forwards}}
`;

/**
 * Show it only in the installed app, and only on its first page this session.
 * Anything unexpected (no matchMedia, storage blocked) leaves it hidden.
 */
export const SHOW_SCRIPT = `try{var m=function(q){return window.matchMedia&&window.matchMedia(q).matches};
var app=navigator.standalone===true||m('(display-mode: standalone)')||m('(display-mode: fullscreen)')||m('(display-mode: minimal-ui)');
var k='${SESSION_KEY}';if(app&&!sessionStorage.getItem(k)){sessionStorage.setItem(k,'1');document.documentElement.setAttribute('data-splash','show')}}catch(e){}`;

export function SplashScreen() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {/* Runs during HTML parsing, before the overlay below is painted. */}
      <script dangerouslySetInnerHTML={{ __html: SHOW_SCRIPT }} />
      <div className="hl-splash" aria-hidden="true">
        <div className="hl-splash__mark">
          <span className="hl-splash__ring" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK_SRC} alt="" width={SIZE} height={SIZE} />
        </div>
        <p className="hl-splash__name">{NAME}</p>
        {TAGLINE && <p className="hl-splash__tagline">{TAGLINE}</p>}
      </div>
    </>
  );
}
