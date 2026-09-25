export const Colors = {
  // Old internet cleaned-up theme
  background: '#F8F8FF',    // Ghost white (light background)
  surface: '#1B1B1B',      // Very dark gray (almost black)
  primary: '#1B1B1B',      // Very dark gray text
  secondary: '#666666',    // Medium gray
  accent: '#FF1A1A',       // Bright red accent
  error: '#FF1A1A',        // Same red for errors
  success: '#00AA00',      // Classic green
  warning: '#FF6B00',      // Orange warning
  
  // Additional old-web inspired colors
  link: '#0000EE',         // Classic blue link
  linkVisited: '#551A8B',  // Classic purple visited link
  border: '#CCCCCC',       // Light gray borders
  
  // Post color presets (old school internet + modern)
  postColors: [
    // neutrals light to dark, then the warm half of the wheel, then the
    // cool half - so the cycle button walks a spectrum instead of a jumble
    '#F8F8FF', // Ghost White
    '#FAEBD7', // Antique White
    '#B7BEC7', // Cool Gray
    '#3D3D42', // Graphite
    '#000000', // Eerie Black
    '#690016', // Oxblood
    '#FF1A1A', // Bright Red
    '#FF940A', // Bright Orange
    '#F0FF00', // Bright Yellow
    '#CCFF00', // Highlighter
    '#32CD32', // Lime Green
    '#00CED1', // Dark Turquoise
    '#0000EE', // Link Blue
    '#4169E1', // Royal Blue
    '#AB00FF', // Electric Violet
    '#9932CC', // Dark Orchid
    '#FF1493', // Deep Pink
    '#FF90C2', // Baby Pink
  ],
  
  // Per-character palette for rainbow text. Must match RAINBOW_TEXT_PALETTE
  // in backend/posts/models.py so preview and render cycle identically.
  rainbowPalette: ['#FF1A1A', '#FF9500', '#FFD700', '#32CD32', '#00CED1', '#9932CC'],

  // Avatar colors (old-web inspired)
  avatarColors: [
    '#FF1A1A', '#0000EE', '#00AA00', '#FF6B00', '#551A8B',
    '#008080', '#800080', '#FF69B4', '#32CD32', '#FF4500',
    '#4682B4', '#DAA520', '#DC143C', '#2E8B57', '#FF6347',
    '#4169E1', '#8B4513', '#20B2AA', '#B22222', '#228B22'
  ],
};

// Font families loaded in App.tsx from assets/fonts - the exact same TTFs the
// backend renders with, so the composer preview matches the server output.
// Loaded font files carry their own weight; synthetic fontWeight must stay
// 'normal' or iOS substitutes a different face.
// Bold/italic faces per family. Families without a real face simply do not
// offer the toggle (no synthetic styling - the face is the truth).
export const resolveFontFace = (
  family: keyof typeof FontChoices,
  bold?: boolean,
  italic?: boolean,
): string => {
  const config = FontChoices[family];
  const variants = (config as any).variants || {};
  if (bold && italic && variants.boldItalic) return variants.boldItalic;
  if (bold && variants.bold) return variants.bold;
  if (italic && variants.italic) return variants.italic;
  return config.fontFamily;
};

export const FontChoices = {
  'arial-black': {
    name: 'Arial Black',
    fontFamily: 'ArialBlack',
    fontWeight: 'normal' as const,
  },
  'crimson-text': {
    name: 'Crimson Text',
    fontFamily: 'TimesNewRoman',
    fontWeight: 'normal' as const,
    variants: { bold: 'TimesNewRomanBold', italic: 'TimesNewRomanItalic', boldItalic: 'TimesNewRomanBoldItalic' },
  },
  'papyrus': {
    // Extracted from the macOS .ttc via fontTools; same file both sides
    name: 'Papyrus',
    fontFamily: 'Papyrus',
    fontWeight: 'normal' as const,
  },
  'impact': {
    name: 'Impact',
    fontFamily: 'Impact',
    fontWeight: 'normal' as const,
  },
  'courier-prime': {
    // Typewriter register
    name: 'Courier',
    fontFamily: 'CourierPrime',
    fontWeight: 'normal' as const,
    variants: { bold: 'CourierPrimeBold', italic: 'CourierPrimeItalic', boldItalic: 'CourierPrimeBoldItalic' },
  },
  'caveat': {
    // Handwritten register
    name: 'Caveat',
    fontFamily: 'Caveat',
    fontWeight: 'normal' as const,
    variants: { bold: 'CaveatBold' },
  },
};

// A rainbow letter whose colour sits this close (RGB distance) to a solid
// background vanishes into it, so those colours are skipped for that post.
// Across the palette every pairing is either <= 74 or >= 106; the cut sits in
// the gap. Mirrors RAINBOW_MIN_DISTANCE / Post._rainbow_palette on the server.
export const RAINBOW_MIN_DISTANCE = 90;

// background: the post's solid colour, or null for gradients and images,
// which vary under each letter and keep the whole rainbow.
export const rainbowFor = (background: string | null): string[] => {
  const full = Colors.rainbowPalette;
  if (!background || !/^#[0-9a-f]{6}$/i.test(background)) return full;
  const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const bg = rgb(background);
  const visible = full.filter(c => {
    const [r, g, b] = rgb(c);
    return Math.hypot(r - bg[0], g - bg[1], b - bg[2]) >= RAINBOW_MIN_DISTANCE;
  });
  return visible.length >= 2 ? visible : full;
};
