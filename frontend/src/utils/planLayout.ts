import { baselineFromTop } from '../constants/fontMetrics';
import type { PlanRun } from '../types/textPlan';

// Where a draw-list run goes as a React Native Text: absolutely placed so
// its baseline lands on the run's baseline. A single-line Text's baseline
// sits baselineFromTop x fontSize below its top (constants/fontMetrics,
// measured from the same font files). Points in, points out.
export interface PlacedRun {
  left: number;
  top: number;
  width: number; // the run's advance, plus room so it never wraps
  fontSize: number;
}

export const RUN_SLACK = 0.25; // em of spare width: never let a run wrap

export function placeRun(run: PlanRun, face: string, size: number, scale: number, offsetX: number, offsetY: number): PlacedRun {
  const fontSize = size * scale;
  return {
    left: offsetX + run.left * scale,
    top: offsetY + run.baseline * scale - baselineFromTop(face) * fontSize,
    width: run.advance * scale + fontSize * RUN_SLACK,
    fontSize,
  };
}
