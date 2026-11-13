#!/usr/bin/env node
// ZEVN banner — TrueColor ANSI gradient, zero deps, stderr-safe for npm install

// 5-row grid, full blocks only — every glyph is padded to a fixed width
const HEIGHT = 5;

const FONT = {
  '>': [
    '██    ',
    '  ██  ',
    '    ██',
    '  ██  ',
    '██    ',
  ],
  'Z': [
    '███████',
    '     ██',
    '   ██  ',
    ' ██    ',
    '███████',
  ],
  'E': [
    '███████',
    '██     ',
    '█████  ',
    '██     ',
    '███████',
  ],
  'V': [
    '██    ██',
    '██    ██',
    '██    ██',
    ' ██  ██ ',
    '  ████  ',
  ],
  'N': [
    '███    ██',
    '██ █   ██',
    '██  █  ██',
    '██   █ ██',
    '██    ███',
  ],
  ' ': [
    '  ',
    '  ',
    '  ',
    '  ',
    '  ',
  ],
};

const CHARS = ['>', ' ', 'Z', ' ', 'E', ' ', 'V', ' ', 'N'];

// TrueColor ANSI fg
const rgb = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

// Gradient stops: pink → purple → cyan
const GRADIENT = [
  [244, 114, 182], // #f472b6 pink
  [192, 132, 252], // #c084fc purple
  [103, 232, 249], // #67e8f9 cyan
];

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function gradientColor(t) {
  const seg = Math.min(Math.floor(t * (GRADIENT.length - 1)), GRADIENT.length - 2);
  const local = t * (GRADIENT.length - 1) - seg;
  const [r1, g1, b1] = GRADIENT[seg];
  const [r2, g2, b2] = GRADIENT[seg + 1];
  return [lerp(r1, r2, local), lerp(g1, g2, local), lerp(b1, b2, local)];
}

function buildBannerRows() {
  // Build each text row, char by char with column-based gradient
  const rows = Array.from({ length: HEIGHT }, () => '');
  const totalCols = CHARS.reduce((s, c) => s + (FONT[c]?.[0]?.length ?? 0), 0);
  let col = 0;

  for (const ch of CHARS) {
    const glyphs = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < HEIGHT; r++) {
      const seg = glyphs[r].padEnd(glyphs[0].length, ' ');
      for (let i = 0; i < seg.length; i++) {
        const t = totalCols > 1 ? (col + i) / (totalCols - 1) : 0;
        const [r_, g_, b_] = gradientColor(t);
        rows[r] += rgb(r_, g_, b_) + BOLD + seg[i] + RESET;
      }
    }
    col += glyphs[0].length;
  }
  return rows;
}

export function printBanner() {
  const pad = '  ';
  const rows = buildBannerRows();

  const divider = `${DIM}${'─'.repeat(52)}${RESET}`;
  const subtitle = `${DIM}  ScrapeChangeTicket — Change Management Intelligence${RESET}`;
  const cmds = [
    `  ${rgb(...GRADIENT[0])}npm run dev${RESET}   ${DIM}Start full-stack dev server${RESET}`,
    `  ${rgb(...GRADIENT[1])}npm start${RESET}     ${DIM}Start backend only${RESET}`,
    `  ${rgb(...GRADIENT[2])}npm run check:memory${RESET}  ${DIM}Validate AGENTS.md sync${RESET}`,
  ];

  const out = [
    '',
    ...rows.map(r => pad + r),
    '',
    subtitle,
    divider,
    ...cmds,
    divider,
    '',
  ].join('\n');

  process.stderr.write(out + '\n');
}

// Auto-run when invoked directly
const isMain = process.argv[1] &&
  (process.argv[1].endsWith('banner.js') || process.argv[1].endsWith('banner'));

if (isMain) printBanner();
