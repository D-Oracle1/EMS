/**
 * The opening splash: the Hylink mark starts broken into scattered pieces,
 * flies back together, the name rises in beneath it and the tagline follows;
 * then the screen fades into the app. Shown once per app opening (per browser
 * session), so it greets a launch, not every page change.
 *
 * Its final frame is the same layout as the static iOS launch screens in
 * public/splash (mark 84px, name 24px, tagline 14px, the doodle pattern at 6%),
 * which the operating system shows while the app starts; this then takes over.
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
const GRID = 7; // 7 x 7 = 49 pieces
const SIZE = 84; // px, the assembled mark

// Timeline (ms). The pieces land by ~2.2s, the name rises letter by letter,
// the tagline follows, and the screen holds before fading out at ~5.8s.
const PIECE_DURATION = 1500;
const PIECE_STAGGER = 700;
const SETTLE_AT = 2200;
const NAME_AT = 2300;
const LETTER_STEP = 55;
const TAGLINE_AT = 3500;
const FADE_AT = 5200;
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
  const angle = rand() * Math.PI * 2;
  const distance = 90 + rand() * 170;
  return {
    key: i,
    style: {
      left: `${(col * 100) / GRID}%`,
      top: `${(row * 100) / GRID}%`,
      backgroundPosition: `${(col * 100) / (GRID - 1)}% ${(row * 100) / (GRID - 1)}%`,
      '--dx': `${Math.round(Math.cos(angle) * distance)}px`,
      '--dy': `${Math.round(Math.sin(angle) * distance)}px`,
      '--r': `${Math.round((rand() - 0.5) * 540)}deg`,
      '--s': (0.2 + rand() * 0.5).toFixed(2),
      '--d': `${Math.round(rand() * PIECE_STAGGER)}ms`,
    } as React.CSSProperties,
  };
});

const CSS = `
html[data-splash="done"] .hl-splash{display:none}
.hl-splash{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fff;
  animation:hl-out ${FADE_FOR}ms ease-in ${FADE_AT}ms forwards;pointer-events:auto}
${PATTERN_SRC ? `.hl-splash::before{content:"";position:absolute;inset:0;background:url(${PATTERN_SRC}) repeat;background-size:360px 360px;opacity:.06;pointer-events:none}` : ''}
.hl-splash>*{position:relative}
.hl-splash__mark{width:${SIZE}px;height:${SIZE}px;animation:hl-settle .6s ease-out ${SETTLE_AT}ms both}
.hl-splash__piece{position:absolute;width:${100 / GRID}%;height:${100 / GRID}%;
  background-image:url(${MARK_SRC});background-size:${GRID * 100}% ${GRID * 100}%;background-repeat:no-repeat;
  will-change:transform,opacity;animation:hl-assemble ${PIECE_DURATION}ms cubic-bezier(.2,.85,.25,1) var(--d) both}
.hl-splash__name{margin:18px 0 0;font:700 24px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:-.01em;color:${NAVY};white-space:nowrap}
.hl-splash__name span{display:inline-block;animation:hl-rise .55s cubic-bezier(.2,.85,.25,1) both}
.hl-splash__tagline{margin:6px 0 0;font:400 14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:${SLATE};white-space:nowrap;
  animation:hl-rise .7s ease-out ${TAGLINE_AT}ms both}
@keyframes hl-assemble{
  from{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(var(--r)) scale(var(--s));filter:blur(1.5px)}
  55%{opacity:1}
  to{opacity:1;transform:none;filter:none}}
@keyframes hl-settle{0%{transform:scale(1)}45%{transform:scale(1.06)}100%{transform:scale(1)}}
@keyframes hl-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes hl-out{to{opacity:0;visibility:hidden;pointer-events:none}}
@media (prefers-reduced-motion:reduce){
  .hl-splash__piece,.hl-splash__mark,.hl-splash__name span,.hl-splash__tagline{animation:none}
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
          {PIECES.map((p) => (
            <span key={p.key} className="hl-splash__piece" style={p.style} />
          ))}
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
