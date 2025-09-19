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
  
  // Avatar colors (old-web inspired)
  avatarColors: [
    '#FF1A1A', '#0000EE', '#00AA00', '#FF6B00', '#551A8B',
    '#008080', '#800080', '#FF69B4', '#32CD32', '#FF4500',
    '#4682B4', '#DAA520', '#DC143C', '#2E8B57', '#FF6347',
    '#4169E1', '#8B4513', '#20B2AA', '#B22222', '#228B22'
  ],
};

export const FontChoices = {
  'arial-black': {
    name: 'Arial Black',
    fontFamily: 'System',
    fontWeight: '900' as const,
  },
  'crimson-text': {
    name: 'Crimson Text',
    fontFamily: 'Times',
    fontWeight: 'bold' as const,
  },
  'papyrus': {
    name: 'Papyrus',
    fontFamily: 'System',
    fontWeight: 'bold' as const,
  },
  'impact': {
    name: 'Impact',
    fontFamily: 'System',
    fontWeight: '900' as const,
  },
};
