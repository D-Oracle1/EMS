/**
 * The opening splash. The Hy-Link mark appears whole (as on the launch screen
 * the phone showed a moment before), disintegrates into flying pieces, pulls
 * itself back together, and the name and tagline rise in beneath it; then the
 * screen fades into the app. Shown once per app opening (per browser session),
 * so it greets a launch, not every page change.
 *
 * Its first and last frames are the same layout as the static iOS launch
 * screens in public/splash (mark 64px, name 22px, tagline 13px, the doodle
 * pattern at 6%), so the hand-over from the operating system is seamless.
 *
 * No grid lines: the pieces are whole-pixel tiles (an 8 x 8 grid of 8px tiles
 * over a 64px mark), and the tiles are never on screen at rest. The intact
 * mark is a single image: it fades out only once the pieces are already
 * moving, and fades back in just before the last of them land, so they slide
 * into a logo that is already whole. (Tiles sitting still, even on exact
 * pixels, show hairline seams on high-density screens.)
 *
 * Self-contained and portable on purpose: one file, no dependencies, no client
 * JavaScript. The animation is pure CSS, so it plays from the first paint,
 * before React hydrates; it hides itself when done (visibility: hidden, no
 * pointer events). A tiny inline script marks the session so a reload or a
 * later visit in the same session skips it. Respects prefers-reduced-motion.
 *
 * To reuse elsewhere: drop this file in, point MARK_SRC at a square logo, set
 * NAME and TAGLINE (and PATTERN_SRC, or null for none). Rendered once, high in
 * the root layout's <body>.
 */

const MARK_SRC = '/brand/mark.png';
const PATTERN_SRC: string | null = '/brand/pattern.jpg';
const NAME = 'Hy-Link Finance';
const TAGLINE = 'Your Financial Future, Secured';
const NAVY = '#002078';
const SLATE = '#475569';

const GRID = 8; // 8 x 8 = 64 pieces
const TILE = 8; // px per piece: whole pixels, so neighbouring pieces meet exactly
const SIZE = GRID * TILE; // 64px, the mark

// Timeline (ms after first paint).
const WHOLE_UNTIL = 600; // the intact mark, matching the launch screen
const BREAK_STAGGER = 150; // pieces start breaking within this window
const BREAK_DURATION = 2900; // fly apart, drift, fly back
const LANDED_BY = WHOLE_UNTIL + BREAK_STAGGER + BREAK_DURATION; // ~3.65s
const WHOLE_FADE_OUT = 200; // the image fades as the pieces start moving
const WHOLE_FADE_IN = 350;
const WHOLE_AGAIN_AT = LANDED_BY - 550; // solid again before the last pieces land
const SETTLE_AT = LANDED_BY;
const NAME_AT = LANDED_BY + 150;
const LETTER_STEP = 50;
const TAGLINE_AT = NAME_AT + Array.from(NAME).length * LETTER_STEP + 300;
const FADE_AT = 6400;
const FADE_FOR = 600;
const SESSION_KEY = 'hl-splash';

/** Seeded PRNG, so the server and the browser scatter the pieces identically. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261002);
const PIECES = Array.from({ length: GRID * GRID }, (_, i) => {
  const row = Math.floor(i / GRID);
  const col = i % GRID;
  // Fly outward from the centre, roughly away from where the piece sits.
  const cx = col - (GRID - 1) / 2;
  const cy = row - (GRID - 1) / 2;
  const angle = Math.atan2(cy, cx) + (rand() - 0.5) * 1.4;
  const distance = 70 + rand() * 130;
  return {
    key: i,
    style: {
      left: `${col * TILE}px`,
      top: `${row * TILE}px`,
      backgroundPosition: `-${col * TILE}px -${row * TILE}px`,
      '--dx': `${Math.round(Math.cos(angle) * distance)}px`,
      '--dy': `${Math.round(Math.sin(angle) * distance)}px`,
      '--r': `${Math.round((rand() - 0.5) * 520)}deg`,
      '--s': (0.45 + rand() * 0.5).toFixed(2),
      animationDelay: `${WHOLE_UNTIL + Math.round(rand() * BREAK_STAGGER)}ms`,
    } as React.CSSProperties,
  };
});

const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

const CSS = `
html[data-splash="done"] .hl-splash{display:none}
.hl-splash{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fff;
  animation:hl-out ${FADE_FOR}ms ease-in ${FADE_AT}ms forwards;pointer-events:auto}
${PATTERN_SRC ? `.hl-splash::before{content:"";position:absolute;inset:0;background:url(${PATTERN_SRC}) repeat;background-size:360px 360px;opacity:.06;pointer-events:none}` : ''}
.hl-splash>*{position:relative}
.hl-splash__mark{width:${SIZE}px;height:${SIZE}px;animation:hl-settle .6s ease-out ${SETTLE_AT}ms both}
.hl-splash__whole{position:absolute;inset:0;width:${SIZE}px;height:${SIZE}px;z-index:1;
  animation:hl-hide ${WHOLE_FADE_OUT}ms ease-in ${WHOLE_UNTIL}ms forwards,hl-show ${WHOLE_FADE_IN}ms ease-out ${WHOLE_AGAIN_AT}ms forwards}
.hl-splash__pieces{position:absolute;inset:0;animation:hl-hide 1ms linear ${LANDED_BY + 50}ms forwards}
.hl-splash__piece{position:absolute;width:${TILE}px;height:${TILE}px;
  background-image:url(${MARK_SRC});background-size:${SIZE}px ${SIZE}px;background-repeat:no-repeat;
  animation:hl-break ${BREAK_DURATION}ms cubic-bezier(.45,0,.2,1) both}
.hl-splash__name{margin:16px 0 0;font:700 22px/1.2 ${FONT};letter-spacing:-.01em;color:${NAVY};white-space:nowrap}
.hl-splash__name span{display:inline-block;animation:hl-rise .55s cubic-bezier(.2,.85,.25,1) both}
.hl-splash__tagline{margin:5px 0 0;font:400 13px/1.4 ${FONT};color:${SLATE};white-space:nowrap;
  animation:hl-rise .7s ease-out ${TAGLINE_AT}ms both}
@keyframes hl-break{
  0%{transform:none;opacity:1}
  30%{transform:translate(var(--dx),var(--dy)) rotate(var(--r)) scale(var(--s));opacity:.85}
  52%{transform:translate(calc(var(--dx) * 1.12),calc(var(--dy) * 1.12)) rotate(calc(var(--r) * 1.15)) scale(var(--s));opacity:.7}
  100%{transform:none;opacity:1}}
@keyframes hl-settle{0%{transform:scale(1)}45%{transform:scale(1.07)}100%{transform:scale(1)}}
@keyframes hl-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes hl-hide{to{opacity:0}}
@keyframes hl-show{from{opacity:0}to{opacity:1}}
@keyframes hl-out{to{opacity:0;visibility:hidden;pointer-events:none}}
@media (prefers-reduced-motion:reduce){
  .hl-splash__mark,.hl-splash__whole,.hl-splash__name span,.hl-splash__tagline{animation:none}
  .hl-splash__pieces{display:none}
  .hl-splash{animation:hl-out .4s ease-in 1.8s forwards}}
`;

/** Skip if this session has already seen it; otherwise remember that it has. */
const SESSION_SCRIPT = `try{var k='${SESSION_KEY}';if(sessionStorage.getItem(k)){document.documentElement.setAttribute('data-splash','done')}else{sessionStorage.setItem(k,'1')}}catch(e){}`;

export function SplashScreen() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {/* Runs during HTML parsing, before the overlay below is painted. */}
      <script dangerouslySetInnerHTML={{ __html: SESSION_SCRIPT }} />
      <div className="hl-splash" aria-hidden="true">
        <div className="hl-splash__mark">
          <div className="hl-splash__pieces">
            {PIECES.map((p) => (
              <span key={p.key} className="hl-splash__piece" style={p.style} />
            ))}
          </div>
          {/* The intact mark, shown while it is at rest. Same box and scaling
              as the pieces, so swapping between them shows no shift. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="hl-splash__whole" src={MARK_SRC} alt="" width={SIZE} height={SIZE} />
        </div>
        <p className="hl-splash__name">
          {Array.from(NAME).map((ch, i) => (
            <span key={i} style={{ animationDelay: `${NAME_AT + i * LETTER_STEP}ms` }}>
              {ch === ' ' ? ' ' : ch}
            </span>
          ))}
        </p>
        {TAGLINE && <p className="hl-splash__tagline">{TAGLINE}</p>}
      </div>
    </>
  );
}
