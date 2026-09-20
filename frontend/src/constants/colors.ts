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
    '#F8F8FF', // Ghost White
    '#FF1A1A', // Bright Red (classic web red)
    '#FAEBD7', // Antique White
    '#000000', // Eerie Black
    '#0000EE', // Link Blue (classic web blue)
    '#FF1493', // Deep Pink (90s neon)
    '#00CED1', // Dark Turquoise (retro teal)
    '#9932CC', // Dark Orchid (early web purple)
    '#FF6347', // Tomato (warm retro orange)
    '#32CD32', // Lime Green (classic bright green)
    '#FFD700', // Gold (old web gold)
    '#DC143C', // Crimson (deep red)
    '#4169E1', // Royal Blue (refined blue)
    '#8B008B', // Dark Magenta (deep purple)
    '#2F4F4F', // Dark Slate Gray (modern neutral)
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
