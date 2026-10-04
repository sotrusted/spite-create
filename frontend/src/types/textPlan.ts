// The server's draw list for a post's text (Post.text_plan, TEXT_PLAN_VERSION
// on the server; built by Post._ink_plan, which the render itself is painted
// from). Canvas px of the post it belongs to.

export const TEXT_PLAN_VERSION = 1 as const;

export interface PlanRun {
  text: string;
  fill: string;
  left: number; // pen position
  baseline: number;
  advance: number; // pen travel across the run
}

export interface PlanLine {
  from: [number, number];
  to: [number, number];
  width: number;
  fill: string;
}

export interface PlanChip {
  rect: [number, number, number, number];
  fill: string;
}

export interface PlanElement {
  face: string; // font file name = the app's font family
  size: number;
  outline: string | null;
  stroke: number; // border width, px (0 for none)
  glow: number; // halo radius, px (0 for none)
  opacity: number;
  chips: PlanChip[];
  runs: PlanRun[];
  lines: PlanLine[];
}

export interface TextPlan {
  version: typeof TEXT_PLAN_VERSION;
  canvas: [number, number];
  elements: PlanElement[];
}

export const isTextPlan = (value: unknown): value is TextPlan =>
  !!value && typeof value === 'object' && (value as TextPlan).version === TEXT_PLAN_VERSION
  && Array.isArray((value as TextPlan).elements);
