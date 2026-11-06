import type { LineBox } from './lineChips';

// The composer's caret is drawn from the drawn text's own layout (iOS
// onTextLayout), not left to the hidden text field: the field lays the
// text out again by its own rules (a line gap, no list markers, a frame
// late on a return), so its caret wanders off the lines you see.

// The typed text's index -> the drawn text's, which carries a list marker
// at the start of every non-blank line (applyListPrefixes)
export function displayIndex(typed: string, index: number, marker: (n: number) => string): number {
  let shift = 0;
  let n = 0;
  let start = 0;
  for (const line of typed.split('\n')) {
    if (start > index) break;
    if (line.trim()) shift += marker(++n).length;
    start += line.length + 1;
  }
  return index + shift;
}

// Where an index falls in laid-out lines (whose texts run end to end over
// the whole string, each with its newline): the line, and that line's text
// before the caret. An index at a soft wrap belongs to the next line, as
// iOS draws it. After a final newline the caret sits on the empty line
// iOS lays out below the last one, which onTextLayout may not report.
export type CaretSpot = { line: number; prefix: string; blank: boolean; below: boolean };

export function caretSpot(lines: LineBox[], text: string, index: number): CaretSpot | null {
  if (!lines.length) return null;
  const at = Math.max(0, Math.min(index, text.length));
  if (at === text.length && text.endsWith('\n')) {
    // laid out with that empty line reported, it is the last line itself
    const last = lines.length - 1;
    return { line: last, prefix: '', blank: true, below: lines[last].text !== '' };
  }
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const own = lines[i].text;
    const end = start + own.length;
    if (at < end || i === lines.length - 1) {
      const prefix = own.slice(0, at - start).replace(/\n$/, '');
      return { line: i, prefix, blank: !own.replace(/\n$/, '').length, below: false };
    }
    start = end;
  }
  return null;
}

// The caret's x in the text box: the line's start (its alignment already
// applied) plus the width before the caret. An empty line has no start of
// its own, so it takes the alignment's edge or centre of the box.
export function caretX(
  line: LineBox, spot: CaretSpot, prefixWidth: number, boxWidth: number,
  align: 'left' | 'center' | 'right',
): number {
  if (spot.blank) return align === 'left' ? 0 : align === 'right' ? boxWidth : boxWidth / 2;
  return line.x + prefixWidth;
}
