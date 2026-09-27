// Dead vertical space between pieces of content is closed up when a post is
// made: a caption placed high above a quote lands a comfortable gap above it
// instead of across a screenful of empty background. Only the gaps shrink -
// nothing is reordered, the top piece never moves, and a gap already under
// the cap is left exactly as placed.

// The largest gap a post keeps between two pieces of content, as a fraction
// of the screen width (about 48pt on a 440pt phone, 119px on the canvas).
// Deliberately loose: a clear pause stays a pause.
export const MAX_GAP_FRACTION = 0.11;

export type Band = { top: number; bottom: number };

// Vertical shift (<= 0, same units as the bands) for each band, in input
// order. Overlapping or touching bands move together as one block.
export function compactGaps(bands: Band[], maxGap: number): number[] {
  const order = bands.map((_, i) => i).sort((a, b) => bands[a].top - bands[b].top);
  const shifts = new Array(bands.length).fill(0);
  let shift = 0;
  let reach = -Infinity; // lowest bottom of everything placed so far
  for (const i of order) {
    const { top, bottom } = bands[i];
    if (reach !== -Infinity && top - reach > maxGap) {
      shift += top - reach - maxGap;
    }
    shifts[i] = shift ? -shift : 0;
    reach = Math.max(reach, bottom);
  }
  return shifts;
}
