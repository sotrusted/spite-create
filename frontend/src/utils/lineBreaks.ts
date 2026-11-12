// Where a text's lines break. iOS lays the composer's text out, and the post
// is drawn with the lines it made: the composer reads them off the placed
// text and sends them, and the server breaks there and nowhere else (two
// wrappers - iOS's and one of the server's own - never quite agree).

// The offsets in `drawn` where a laid-out line starts that is not after a
// typed line break, from the lines iOS reports for it; null when they do not
// add up to it (a stale report).
export function softBreaks(lines: { text: string }[], drawn: string): number[] | null {
  const breaks: number[] = [];
  let at = 0;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;
    // (iOS reports a capitalised line in capitals)
    if (drawn.slice(at, at + text.length).toUpperCase() !== text.toUpperCase()) return null;
    at += text.length;
    if (i === lines.length - 1) break;
    if (drawn[at - 1] === '\n') continue; // the line ended on its typed break
    if (drawn[at] === '\n') { at += 1; continue; } // ... reported without it
    breaks.push(at);
  }
  return at === drawn.length || drawn.slice(at).trim() === '' ? breaks : null;
}

// UTF-16 offsets into `text` as code point offsets into the text the server
// is sent (`transform` of each character, as the payload sends it): the
// server counts characters in code points
export function breaksToCodePoints(text: string, breaks: number[], transform: (ch: string) => string = ch => ch): number[] {
  const at = new Map<number, number>([[0, 0]]);
  let utf16 = 0;
  let sent = 0;
  for (const ch of text) {
    utf16 += ch.length;
    sent += Array.from(transform(ch)).length;
    at.set(utf16, sent);
  }
  return breaks.flatMap(b => (at.has(b) ? [at.get(b)!] : []));
}
