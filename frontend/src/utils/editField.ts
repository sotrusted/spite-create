// The composer's text field while typing. The field is the text you see:
// iOS lays it out once, so a tap, the caret, a selection and its handles
// all land on the letters drawn (a styled copy over an invisible field
// drifted off them: two layouts of one text never quite agree).
//
// The field holds the text as drawn - capitals with caps on, a list marker
// before every non-blank line - while the element keeps the text as typed.
// Every edit to the field is read back onto the typed text here.

export type FieldOptions = {
  caps: boolean;
  marker: (n: number) => string; // the nth non-blank line's marker, '' for none
};

// Capitals letter for letter: a letter whose capital is longer (ß -> SS)
// stays as it is, so an index means the same letter in both
export const capsOf = (text: string): string =>
  Array.from(text, ch => {
    const up = ch.toUpperCase();
    return up.length === ch.length ? up : ch;
  }).join('');

// Where each line's marker sits: [start, end) in the field, and the typed
// index of that line's start
type MarkerSpan = { start: number; end: number; typed: number };

const markerSpans = (typed: string, marker: FieldOptions['marker']): MarkerSpan[] => {
  const spans: MarkerSpan[] = [];
  let n = 0;
  let shift = 0;
  let start = 0;
  for (const line of typed.split('\n')) {
    if (line.trim()) {
      const m = marker(++n);
      if (m) spans.push({ start: start + shift, end: start + shift + m.length, typed: start });
      shift += m.length;
    }
    start += line.length + 1;
  }
  return spans;
};

export function fieldText(typed: string, { caps, marker }: FieldOptions): string {
  const drawn = caps ? capsOf(typed) : typed;
  let n = 0;
  return drawn.split('\n').map(line => (line.trim() ? marker(++n) + line : line)).join('\n');
}

// A typed index -> the field's: past every marker up to its line. An index
// at a line's start is after that line's marker.
export function toField(typed: string, index: number, { marker }: FieldOptions): number {
  let shift = 0;
  for (const s of markerSpans(typed, marker)) {
    if (s.typed > index) break;
    shift += s.end - s.start;
  }
  return index + shift;
}

// A field index -> the typed text's. Inside a marker is its line's start.
export function toTyped(typed: string, index: number, { marker }: FieldOptions): number {
  let shift = 0;
  for (const s of markerSpans(typed, marker)) {
    if (index < s.start) break;
    if (index < s.end) return s.typed;
    shift += s.end - s.start;
  }
  return index - shift;
}

export type FieldEdit = {
  typed: string; // the typed text after the edit
  caret: number; // the caret after it, in the typed text
};

// The field's text went from `before` (what we last drew) to `after` (what
// iOS now holds): the same edit, on the typed text. The edit is read as one
// replaced span (common prefix and suffix kept), as adjustRuns reads it.
// - Letters typed with caps on are kept in lower case: turning caps off
//   gives them back in lower case, the text from before caps as it was.
// - A marker is not typed text. Deleting into one joins its line to the
//   line before, as a backspace at a bullet does in Notes; anything else
//   typed over one lands at its line's start.
export function readEdit(typed: string, before: string, after: string, opts: FieldOptions): FieldEdit {
  let prefix = 0;
  const max = Math.min(before.length, after.length);
  while (prefix < max && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < max - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  let inserted = after.slice(prefix, after.length - suffix);
  if (opts.caps) inserted = inserted.toLowerCase();

  let start = toTyped(typed, prefix, opts);
  const end = Math.max(start, toTyped(typed, before.length - suffix, opts));
  // a deletion wholly inside a marker: join that line to the one before
  if (!inserted && start === end && prefix < before.length - suffix && start > 0 && typed[start - 1] === '\n') {
    start -= 1;
  }
  return { typed: typed.slice(0, start) + inserted + typed.slice(end), caret: start + inserted.length };
}
