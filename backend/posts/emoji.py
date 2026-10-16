"""Emoji are not part of a post: the composer drops them as they're typed and
the server drops them again (sanitising, models._sanitize_kept). Text symbols
like ♥ and ★ stay, unless they come in their emoji form (followed by U+FE0F,
which is how the emoji keyboard types them). The ranges match
shared/emoji.json, as does frontend/src/utils/emoji.ts (a test on each side)."""
from bisect import bisect_right

EMOJI_RANGES = (
    (0x20E3, 0x20E3),
    (0x231A, 0x231B),
    (0x23E9, 0x23EC),
    (0x23F0, 0x23F0),
    (0x23F3, 0x23F3),
    (0x25FD, 0x25FE),
    (0x2614, 0x2615),
    (0x2648, 0x2653),
    (0x267F, 0x267F),
    (0x2693, 0x2693),
    (0x26A1, 0x26A1),
    (0x26AA, 0x26AB),
    (0x26BD, 0x26BE),
    (0x26C4, 0x26C5),
    (0x26CE, 0x26CE),
    (0x26D4, 0x26D4),
    (0x26EA, 0x26EA),
    (0x26F2, 0x26F3),
    (0x26F5, 0x26F5),
    (0x26FA, 0x26FA),
    (0x26FD, 0x26FD),
    (0x2705, 0x2705),
    (0x270A, 0x270B),
    (0x2728, 0x2728),
    (0x274C, 0x274C),
    (0x274E, 0x274E),
    (0x2753, 0x2755),
    (0x2757, 0x2757),
    (0x2795, 0x2797),
    (0x27B0, 0x27B0),
    (0x27BF, 0x27BF),
    (0x2B1B, 0x2B1C),
    (0x2B50, 0x2B50),
    (0x2B55, 0x2B55),
    (0x1F004, 0x1F004),
    (0x1F0CF, 0x1F0CF),
    (0x1F18E, 0x1F18E),
    (0x1F191, 0x1F19A),
    (0x1F1E6, 0x1F1FF),
    (0x1F201, 0x1F201),
    (0x1F21A, 0x1F21A),
    (0x1F22F, 0x1F22F),
    (0x1F232, 0x1F236),
    (0x1F238, 0x1F23A),
    (0x1F250, 0x1F251),
    (0x1F300, 0x1F64F),
    (0x1F680, 0x1F6FF),
    (0x1F7E0, 0x1F7EB),
    (0x1F7F0, 0x1F7F0),
    (0x1F900, 0x1F9FF),
    (0x1FA70, 0x1FAFF),
    (0xE0020, 0xE007F),
)
_STARTS = [a for a, _b in EMOJI_RANGES]
VS16 = '️'   # emoji presentation selector
ZWJ = '‍'    # joins emoji into one (families, flags); also used by some scripts


def is_emoji(ch):
    cp = ord(ch)
    i = bisect_right(_STARTS, cp) - 1
    return i >= 0 and cp <= EMOJI_RANGES[i][1]


def emoji_indices(text):
    """Indices of the characters that are emoji or part of one."""
    drop = [False] * len(text)
    for i, ch in enumerate(text):
        if ch == VS16:
            drop[i] = True
            if i > 0 and text[i - 1] != ZWJ:
                drop[i - 1] = True
        elif is_emoji(ch):
            drop[i] = True
    # a joiner goes with the emoji it joins, and stays between letters
    for i, ch in enumerate(text):
        if ch == ZWJ and ((i > 0 and drop[i - 1]) or (i + 1 < len(text) and drop[i + 1])):
            drop[i] = True
    return {i for i, d in enumerate(drop) if d}
