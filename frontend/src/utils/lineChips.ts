// The highlighter: a band behind each line of text, the bands touching, so
// the background hugs the lines (one box round the whole block read as a
// quoted post). Mirrors the server's chips (Post._ink_plan,
// snap_line_widths): same snap, same padding, same band edges.

// Neighbouring lines closer in width than this (em of the font size) share
// the wider width: no sliver steps in the outline. CHIP_SNAP_EM on the server.
export const CHIP_SNAP_EM = 0.6;

export function snapLineWidths(widths: number[], fontSize: number): number[] {
  const out = [...widths];
  const snap = fontSize * CHIP_SNAP_EM;
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i], b = out[i + 1];
      if (a > 0 && b > 0 && a !== b && Math.abs(a - b) < snap) {
        out[i] = out[i + 1] = Math.max(a, b);
        changed = true;
      }
    }
  }
  return out;
}

export type LineBox = { x: number; y: number; width: number; height: number; text: string };
export type Band = { left: number; top: number; width: number; height: number };

// The bands for laid-out lines (iOS onTextLayout), in the text's own
// coordinates: each line's box widened by padX and snapped, the first
// raised by padY, the last lowered by padY, blank lines skipped. Snapped
// lines keep their alignment edge (left, right) or centre.
export function lineBands(
  lines: LineBox[], fontSize: number, padX: number, padY: number,
  align: 'left' | 'center' | 'right',
): Band[] {
  const widths = snapLineWidths(lines.map(l => (l.text.trim() ? l.width : 0)), fontSize);
  const bands: Band[] = [];
  lines.forEach((l, i) => {
    if (!l.text.trim()) return;
    const w = widths[i];
    const x = align === 'left' ? l.x : align === 'right' ? l.x + l.width - w : l.x + (l.width - w) / 2;
    const top = l.y - (i === 0 ? padY : 0);
    const bottom = l.y + l.height + (i === lines.length - 1 ? padY : 0);
    bands.push({ left: x - padX, top, width: w + 2 * padX, height: bottom - top });
  });
  return bands;
}
