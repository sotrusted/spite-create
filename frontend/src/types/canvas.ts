// The canvas, as data. CanvasState is the composer's complete working state -
// everything needed to put the canvas back exactly as it was - and it is what
// a post stores (Post.canvas_state) so its author can "Edit again".
//
// It is NOT the render contract: the server renders from the flattened
// PostCreate payload that buildPostPayload derives from this. Keep the two
// apart: this type may grow editor-only fields freely, the payload may not.
//
// Coordinates are screen points on the device that composed it (screenWidth
// x screenHeight). fromCanvasState rescales for a different screen width.
//
// Versioned: bump CANVAS_STATE_VERSION on any breaking change and teach
// fromCanvasState to read the old shape - saved posts live forever. The
// server accepts only the versions it lists (CANVAS_STATE_VERSIONS).
import { FontChoice, StickerElement } from './index';

export const CANVAS_STATE_VERSION = 1 as const;

export type CanvasRect = { left: number; top: number; width: number; height: number };

// One text element exactly as the composer holds it
export interface CanvasTextElement {
  id: string;
  content: string;
  x: number; // centre, screen points
  y: number;
  originalX: number | null;
  originalY: number | null;
  fontSize: number;
  color: string;
  fontFamily: FontChoice;
  hasBackground: boolean;
  backgroundColor: string;
  backgroundMode: 'off' | 'white' | 'inverted';
  capsLock: boolean;
  scale: number;
  letterSpacing: number;
  opacity?: number;
  glow: boolean;
  rainbow: boolean;
  // Two palette colours cycled per letter; wins over rainbow when set
  alternateColors?: string[];
  align: 'left' | 'center' | 'right';
  bold: boolean;
  italic: boolean;
  underline: boolean;
  listStyle: 'none' | 'bullet' | 'dash' | 'star' | 'number';
}

export interface CanvasState {
  version: typeof CANVAS_STATE_VERSION;
  screenWidth: number;
  screenHeight: number;
  textElements: CanvasTextElement[];
  stickerElements: StickerElement[];
  backgroundColor: string;
  backgroundGradient: string[];
  backgroundImage: string | null;
  imageBackgroundScale: number;
  imageBackgroundPosition: { x: number; y: number };
  imageCoverScale: number;
  // Crop bar positions in screen points; at 0 / screenHeight = full bleed
  cropTop: number;
  cropBottom: number;
  isSigned: boolean;
  signatureStyle?: string;
  // The quoted post is referenced, not embedded: its render is re-fetched on
  // restore. stripRect is where the quote sat (null = the default rect).
  repost: { originalPostId: string; stripRect: CanvasRect | null } | null;
}
