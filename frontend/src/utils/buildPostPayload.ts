import type { Post, PostCreate, RepostData, StickerElement } from '../types';

// Fixed logical canvas width. Posts are composed in screen points and mapped
// onto this canvas at submit time, so the server render is identical on every
// device and golden tests are device-independent. Canvas height follows the
// device aspect ratio to keep the composer full-bleed.
export const CANVAS_WIDTH = 1080;

// The composer's text input is 90 percent of the screen width; the backend
// wraps rendered text to the same fraction of the canvas.
export const TEXT_WRAP_FRACTION = 0.9;

export interface ComposerTextElement {
  content: string;
  x: number;
  y: number;
  fontSize: number;
  scale: number;
  color: string;
  fontFamily: string;
  hasBackground: boolean;
  backgroundColor: string;
  capsLock: boolean;
  letterSpacing?: number;
  glow?: boolean;
  rainbow?: boolean;
  // Two palette colours cycled per letter; wins over rainbow when set
  alternateColors?: string[];
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  opacity?: number;
  listStyle?: 'none' | 'bullet' | 'dash' | 'star' | 'number';
  backgroundMode?: 'off' | 'white' | 'inverted';
}

// Everything the payload depends on, captured as plain data. Keeping this a
// pure function of a serializable snapshot is what makes the payload contract
// testable from fixtures on both sides of the API.
export interface ComposerSnapshot {
  screenWidth: number;
  screenHeight: number;
  textElements: ComposerTextElement[];
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
  repostData?: RepostData;
  // Where the composer currently shows the quoted strip (screen points);
  // when absent the default rect is used
  repostStripRect?: { left: number; top: number; width: number; height: number } | null;
}

// Where the quoted strip sits on the composer canvas (screen points).
// Single source of WYSIWYG truth: the preview layer renders it here and the
// payload sends the same rect (in canvas px) for the server bake.
export function getRepostStripRect(
  original: Post | undefined,
  screenW: number,
  screenH: number,
): { left: number; top: number; width: number; height: number } | null {
  const origWidth = original?.image_width;
  const topY = typeof original?.top_y === 'number' ? original.top_y : null;
  const bottomY = typeof original?.bottom_y === 'number' ? original.bottom_y : null;
  if (!origWidth || topY === null || bottomY === null || bottomY <= topY) return null;

  const inset = screenW * 0.05;
  let width = screenW - 2 * inset;
  let height = ((bottomY - topY) / origWidth) * width;

  // Quotes are NOT shrunk to fit any more. Every automatic height cap made
  // deep quotes too small to read, and the canvas now lets you pinch a quote
  // to any size (including past the edges), so the default is simply big and
  // the choice is yours. The server's 5:4 cap remains the backstop.

  // Placement: below the caption slot when it fits, otherwise raised so
  // the strip never bottoms out near the config bar / crop edge
  const top = Math.max(
    screenH * 0.18,
    Math.min(screenH * 0.45, screenH * 0.78 - height),
  );
  return { left: (screenW - width) / 2, top, width, height };
}

export function buildPostPayload(snapshot: ComposerSnapshot): PostCreate {
  const s = snapshot;
  // Screen points to canvas pixels
  const k = CANVAS_WIDTH / s.screenWidth;

  const allText = s.textElements
    .filter(el => el.content.trim())
    .map(el => el.content)
    .join(' ');

  const first = s.textElements[0];

  return {
    text_content: allText,
    text_elements: s.textElements.map(el => {
      // Chip mode maps to render fields here: 'white' = white chip behind
      // the colored text, 'inverted' = colored chip behind white text
      const mode = el.backgroundMode || (el.hasBackground ? 'white' : 'off');
      return {
      // capsLock is a display-only transform in the composer, so bake it
      // into the content the backend renders
      content: el.capsLock ? el.content.toUpperCase() : el.content,
      x: Math.round(el.x * k),
      y: Math.round(el.y * k),
      fontSize: Math.round(el.fontSize * el.scale * k),
      color: mode === 'inverted' ? '#FFFFFF' : el.color,
      fontFamily: el.fontFamily,
      hasBackground: mode !== 'off',
      backgroundColor: mode === 'inverted' ? el.color : '#FFFFFF',
      letterSpacing: Math.round((el.letterSpacing ?? 0) * k),
      glow: !!el.glow,
      rainbow: !!el.rainbow,
      alternateColors: el.alternateColors?.length === 2 ? el.alternateColors : null,
      align: el.align || 'center',
      bold: !!el.bold,
      italic: !!el.italic,
      underline: !!el.underline,
      opacity: el.opacity ?? 1,
      listStyle: el.listStyle || 'none',
      };
    }) as PostCreate['text_elements'],
    sticker_elements: s.stickerElements.map(sticker => ({
      id: sticker.id,
      uri: sticker.uri,
      x: Math.round(sticker.x * k),
      y: Math.round(sticker.y * k),
      width: Math.round(sticker.width * k),
      height: Math.round(sticker.height * k),
      scale: sticker.scale,
      rotation: sticker.rotation,
      shape: sticker.shape,
    })),
    font_choice: (first?.fontFamily as PostCreate['font_choice']) || 'arial-black',
    font_size: Math.round((first?.fontSize || 24) * (first?.scale || 1) * k),
    text_color: first?.color || '#FF1A1A',
    background_color: s.backgroundColor,
    background_gradient: s.backgroundGradient.length > 0 ? s.backgroundGradient : undefined,
    background_image: s.backgroundImage || undefined,
    // The preview treats scale 1 as contentFit="cover"; the backend scales
    // raw image pixels onto the canvas, hence coverScale and k conversions.
    background_image_scale: s.backgroundImage
      ? s.imageBackgroundScale * s.imageCoverScale * k
      : undefined,
    background_image_position: s.backgroundImage
      ? {
          x: Math.round(s.imageBackgroundPosition.x * k),
          y: Math.round(s.imageBackgroundPosition.y * k),
        }
      : undefined,
    // Only send a crop band when the bars were actually moved off full bleed
    ...(s.backgroundImage && (s.cropTop > 0 || s.cropBottom < s.screenHeight)
      ? {
          crop_top: Math.round(s.cropTop * k),
          crop_bottom: Math.round(s.cropBottom * k),
        }
      : {}),
    has_outline: false,
    outline_color: '#000000',
    has_text_background: first?.hasBackground || false,
    text_background_color: first?.hasBackground ? first.backgroundColor : undefined,
    canvas_width: CANVAS_WIDTH,
    canvas_height: Math.round(s.screenHeight * k),
    repost_data: s.repostData
      ? (() => {
          const rect = s.repostStripRect || getRepostStripRect(s.repostData.originalPost, s.screenWidth, s.screenHeight);
          return {
            original_post_id: s.repostData.originalPost.id,
            screenshot_uri: s.repostData.screenshotUri,
            // WYSIWYG: the strip bakes exactly where the composer showed it
            repost_geometry: rect
              ? {
                  x: Math.round(rect.left * k),
                  y: Math.round(rect.top * k),
                  width: Math.round(rect.width * k),
                }
              : undefined,
          };
        })()
      : undefined,
    is_signed: s.isSigned,
    signature_style: s.signatureStyle,
  };
}
