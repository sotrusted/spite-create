// Emoji are not part of a post: the composer drops them as they're typed (or
// pasted) and the server drops them again (backend posts/emoji.py). Text
// symbols like ♥ and ★ stay, unless they come in their emoji form (followed by
// U+FE0F, which is how the emoji keyboard types them). The ranges match
// shared/emoji.json (a test on each side).

export const EMOJI_RANGES: readonly (readonly [number, number])[] = [
  [0x20E3, 0x20E3],
  [0x231A, 0x231B],
  [0x23E9, 0x23EC],
  [0x23F0, 0x23F0],
  [0x23F3, 0x23F3],
  [0x25FD, 0x25FE],
  [0x2614, 0x2615],
  [0x2648, 0x2653],
  [0x267F, 0x267F],
  [0x2693, 0x2693],
  [0x26A1, 0x26A1],
  [0x26AA, 0x26AB],
  [0x26BD, 0x26BE],
  [0x26C4, 0x26C5],
  [0x26CE, 0x26CE],
  [0x26D4, 0x26D4],
  [0x26EA, 0x26EA],
  [0x26F2, 0x26F3],
  [0x26F5, 0x26F5],
  [0x26FA, 0x26FA],
  [0x26FD, 0x26FD],
  [0x2705, 0x2705],
  [0x270A, 0x270B],
  [0x2728, 0x2728],
  [0x274C, 0x274C],
  [0x274E, 0x274E],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27B0, 0x27B0],
  [0x27BF, 0x27BF],
  [0x2B1B, 0x2B1C],
  [0x2B50, 0x2B50],
  [0x2B55, 0x2B55],
  [0x1F004, 0x1F004],
  [0x1F0CF, 0x1F0CF],
  [0x1F18E, 0x1F18E],
  [0x1F191, 0x1F19A],
  [0x1F1E6, 0x1F1FF],
  [0x1F201, 0x1F201],
  [0x1F21A, 0x1F21A],
  [0x1F22F, 0x1F22F],
  [0x1F232, 0x1F236],
  [0x1F238, 0x1F23A],
  [0x1F250, 0x1F251],
  [0x1F300, 0x1F64F],
  [0x1F680, 0x1F6FF],
  [0x1F7E0, 0x1F7EB],
  [0x1F7F0, 0x1F7F0],
  [0x1F900, 0x1F9FF],
  [0x1FA70, 0x1FAFF],
  [0xE0020, 0xE007F],
];

const VS16 = 0xfe0f; // emoji presentation selector
const ZWJ = 0x200d; // joins emoji into one (families, flags); also used by some scripts

const isEmoji = (cp: number) => {
  let lo = 0;
  let hi = EMOJI_RANGES.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [a, b] = EMOJI_RANGES[mid];
    if (cp < a) hi = mid - 1;
    else if (cp > b) lo = mid + 1;
    else return true;
  }
  return false;
};

// The text without its emoji (the same characters the server drops)
export function stripEmoji(text: string): string {
  const cps = Array.from(text, ch => ch.codePointAt(0)!);
  const drop = cps.map(isEmoji);
  cps.forEach((cp, i) => {
    if (cp === VS16) {
      drop[i] = true;
      if (i > 0 && cps[i - 1] !== ZWJ) drop[i - 1] = true;
    }
  });
  // a joiner goes with the emoji it joins, and stays between letters
  const joined = cps.map((cp, i) => cp === ZWJ && (!!drop[i - 1] || !!drop[i + 1]));
  if (!drop.some(Boolean) && !joined.some(Boolean)) return text;
  return cps.filter((_, i) => !drop[i] && !joined[i]).map(cp => String.fromCodePoint(cp)).join('');
}
