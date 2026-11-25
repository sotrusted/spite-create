// A text's box (its highlighter): off, white, or coloured. The box has a
// colour of its own, so the colour button changes the letters and leaves
// the box alone.
//
// Turning the coloured box on gives it the letters' colour and makes the
// letters white; from there each keeps its own. (A coloured box saved before
// the box had a colour has none: it follows the text's colour, white on it.)

export type ChipMode = 'off' | 'white' | 'inverted';

export interface Chipped {
  color: string;
  backgroundMode?: ChipMode;
  chipColor?: string;
}

const WHITE = '#FFFFFF';

// The colour the letters are drawn in
export const inkColor = (el: Chipped): string =>
  el.backgroundMode === 'inverted' && !el.chipColor ? WHITE : el.color;

// The box's colour (null: no box)
export const chipFill = (el: Chipped): string | null =>
  el.backgroundMode === 'white' ? WHITE
    : el.backgroundMode === 'inverted' ? el.chipColor ?? el.color
      : null;

// The box button: off -> white -> coloured -> off
export const nextChip = (el: Chipped): Required<Pick<Chipped, 'backgroundMode'>> & Partial<Chipped> => {
  const mode = el.backgroundMode ?? 'off';
  if (mode === 'off') return { backgroundMode: 'white' };
  if (mode === 'white') return { backgroundMode: 'inverted', chipColor: el.color, color: WHITE };
  // Leaving the coloured box: letters still white from it go back to the
  // colour they gave the box; letters coloured since keep theirs
  const box = chipFill(el)!;
  return { backgroundMode: 'off', chipColor: undefined, color: inkColor(el) === WHITE ? box : el.color };
};
