// Colour for selected text: a text element's colour ranges.
//
// A run colours [start, end) of the typed text (JS string offsets, i.e.
// UTF-16, what a TextInput selection reports). Runs never overlap and are
// kept sorted; where none applies the element's own colour (or its rainbow /
// duo) shows. The payload converts offsets to code points for the server,
// which carries them through wrapping and list markers per visible letter.

export interface ColorRun {
  start: number;
  end: number;
  color: string;
}

const tidy = (runs: ColorRun[]): ColorRun[] => {
  const sorted = runs.filter(r => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: ColorRun[] = [];
  for (const run of sorted) {
    const last = out[out.length - 1];
    if (last && last.end === run.start && last.color === run.color) last.end = run.end;
    else out.push({ ...run });
  }
  return out;
};

// Colour [start, end) - or, with color null, give it back to the element's
// own colour. Whatever was there before is cut around the new range.
export function applyColorToRange(
  runs: ColorRun[] | undefined,
  start: number,
  end: number,
  color: string | null,
): ColorRun[] {
  if (end <= start) return tidy(runs ?? []);
  const kept: ColorRun[] = [];
  for (const run of runs ?? []) {
    if (run.end <= start || run.start >= end) {
      kept.push(run);
      continue;
    }
    if (run.start < start) kept.push({ ...run, end: start });
    if (run.end > end) kept.push({ ...run, start: end });
  }
  if (color) kept.push({ start, end, color });
  return tidy(kept);
}

// Keep runs on their letters as the text is edited. The edit is read as one
// replaced span (common prefix and suffix kept); typing inside or right at
// the end of a coloured run continues its colour, as in a word processor.
export function adjustRuns(oldText: string, newText: string, runs: ColorRun[] | undefined): ColorRun[] {
  if (!runs?.length || oldText === newText) return runs ?? [];
  let prefix = 0;
  const max = Math.min(oldText.length, newText.length);
  while (prefix < max && oldText[prefix] === newText[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) suffix++;
  const removedEnd = oldText.length - suffix; // [prefix, removedEnd) went
  const inserted = newText.length - suffix - prefix;
  const delta = inserted - (removedEnd - prefix);

  const moved: ColorRun[] = [];
  for (const { start: s, end: e, color } of runs) {
    // a start inside the replaced span begins after whatever was typed there
    const start = s < prefix ? s : s >= removedEnd ? s + delta : prefix + inserted;
    const end =
      e < prefix ? e
      // ending right at the edit: typing on continues the colour
      : e === prefix ? (s < prefix ? prefix + inserted : prefix)
      : e >= removedEnd ? e + delta
      : prefix + inserted;
    if (end > start) moved.push({ start, end, color });
  }
  return tidy(moved);
}

// The colour each run gives position i, or null
const colorAt = (runs: ColorRun[] | undefined, i: number) => {
  if (!runs) return null;
  for (const run of runs) if (i >= run.start && i < run.end) return run.color;
  return null;
};

export type Span = { text: string; color: string | null };

// The text as drawn - list markers added, per-letter palette (rainbow or
// duo) cycled over visible letters, ranges on top - grouped into spans of
// one colour. null means the element's own colour.
export function colorSpans(
  raw: string,
  runs: ColorRun[] | undefined,
  cyclePalette: string[] | null,
  linePrefix: (line: string, index: number) => string,
): Span[] {
  type Item = { ch: string; color: string | null };
  const lines: Item[][] = [[]];
  let offset = 0;
  for (const ch of raw) {
    if (ch === '\n') lines.push([]);
    else lines[lines.length - 1].push({ ch, color: colorAt(runs, offset) });
    offset += ch.length;
  }
  const items: Item[] = [];
  lines.forEach((line, i) => {
    if (i > 0) items.push({ ch: '\n', color: null });
    const marker = linePrefix(line.map(it => it.ch).join(''), i);
    for (const ch of marker) items.push({ ch, color: null });
    items.push(...line);
  });

  const spans: Span[] = [];
  let paletteIndex = 0;
  for (const item of items) {
    let color = item.color;
    if (!/\s/.test(item.ch) && cyclePalette) {
      const cycled = cyclePalette[paletteIndex++ % cyclePalette.length];
      color = color ?? cycled;
    }
    const last = spans[spans.length - 1];
    if (last && last.color === color) last.text += item.ch;
    else spans.push({ text: item.ch, color });
  }
  return spans;
}

// For the server: offsets in code points (an emoji is one, not two), into
// the text as sent - `transform` is what the payload does to each character
// first (caps lock: 'ß' becomes 'SS', two letters, so later runs shift)
export function runsToCodePoints(
  text: string,
  runs: ColorRun[] | undefined,
  transform: (ch: string) => string = ch => ch,
): ColorRun[] {
  if (!runs?.length) return [];
  // sent-text code point index at each UTF-16 offset of the typed text
  const at = new Map<number, number>([[0, 0]]);
  let utf16 = 0;
  let sent = 0;
  for (const ch of text) {
    utf16 += ch.length;
    sent += Array.from(transform(ch)).length;
    at.set(utf16, sent);
  }
  const map = (offset: number) => at.get(Math.min(offset, text.length)) ?? sent;
  return runs.map(r => ({ start: map(r.start), end: map(r.end), color: r.color }));
}

// From the server's code points back to this side's UTF-16 offsets
export function runsFromCodePoints(text: string, runs: ColorRun[] | undefined | null): ColorRun[] {
  if (!runs?.length) return [];
  const offsets = [0];
  for (const ch of text) offsets.push(offsets[offsets.length - 1] + ch.length);
  const at = (cp: number) => offsets[Math.max(0, Math.min(cp, offsets.length - 1))];
  return runs.map(r => ({ start: at(r.start), end: at(r.end), color: r.color }));
}
