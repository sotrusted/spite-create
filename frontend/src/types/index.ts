export interface User {
  handle: string;
  avatar_color: string;
  is_anonymous_mode: boolean;
  date_joined: string;
  posts_count_today: number;
  total_posts?: number;
  report_count?: number;
  is_shadowbanned?: boolean;
  shadowban_reason?: string;
  default_signed_posts?: boolean;
  preferred_signature_style?: string;
  signature_font?: string;
  signature_color?: string;
}

export type FontChoice = 'arial-black' | 'crimson-text' | 'papyrus' | 'impact' | 'courier-prime' | 'caveat';

export interface Author {
  handle: string;
  avatar_color: string;
}

export interface Post {
  id: string;
  author: Author;
  text_content: string;
  font_choice: FontChoice;
  font_size: number;
  text_color: string;
  background_color: string;
  background_gradient?: string[];
  has_outline: boolean;
  outline_color: string;
  has_text_background?: boolean;
  text_background_color?: string;
  rendered_image_url?: string;
  created_at: string;
  view_count: number;
  is_repost?: boolean;
  original_post?: Post;
  repost_screenshot_url?: string;
  image_width?: number;
  image_height?: number;
  top_y?: number;
  bottom_y?: number;
  is_signed?: boolean;
  signature_style?: string;
  // Collapsed-repost render + quote chip (reposts only)
  response_image_url?: string | null;
  response_top_y?: number | null;
  response_bottom_y?: number | null;
  quote?: {
    hidden: boolean;
    snippet?: string;
    background_color?: string;
    // Quoted strip's rect on the canvas (canvas px) - used for tap
    // hit-testing and placing the inline collapse chip
    geometry?: { x: number; y: number; width: number; height: number };
  } | null;
  // Full quoted-ancestor chain with rects in THIS post's canvas coords,
  // enabling per-level collapse
  quote_chain?: Array<{
    rect: { x: number; y: number; width: number; height: number };
    strip: {
      url: string | null;
      top_y: number;
      bottom_y: number;
      image_width?: number;
      image_height?: number;
    };
    snippet?: string;
    background_color?: string;
    hidden: boolean;
  }>;
}

export interface TextElement {
  content: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily: FontChoice;
  hasBackground: boolean;
  backgroundColor: string;
  letterSpacing?: number;
  glow?: boolean;
  rainbow?: boolean;
  alternateColors?: string[];
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  opacity?: number;
  listStyle?: 'none' | 'bullet' | 'dash' | 'star' | 'number';
}

export interface StickerElement {
  id: string;
  uri: string; // Image URI
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  shape: 'full' | 'square' | 'rounded'; // Shape mode
}

export interface PostCreate {
  text_content: string;
  text_elements?: TextElement[]; // NEW: Array of positioned text elements
  sticker_elements?: StickerElement[]; // NEW: Array of positioned sticker elements
  font_choice: FontChoice;
  font_size: number;
  text_color: string;
  background_color: string;
  background_gradient?: string[];
  background_image?: string; // NEW: Image background URI
  background_image_scale?: number; // NEW: Image background scale
  background_image_position?: { x: number; y: number }; // NEW: Image background position
  crop_top?: number; // Crop band top in canvas px (from composer crop bars)
  crop_bottom?: number; // Crop band bottom in canvas px
  has_outline: boolean;
  outline_color: string;
  has_text_background?: boolean;
  text_background_color?: string;
  canvas_width: number;
  canvas_height: number;
  repost_data?: {
    original_post_id: string;
    screenshot_uri: string;
    // WYSIWYG quoted-strip placement in canvas px
    repost_geometry?: {
      x: number;
      y: number;
      width: number;
    };
  };
  is_signed?: boolean;
  signature_style?: string;
}

export interface FeedResponse {
  results: Post[];
  next: string | null;
  previous: string | null;
}

export type RootStackParamList = {
  Main: undefined;
  PostComposer: { repostData?: RepostData };
  PostDetail: { postId: string };
  Profile: undefined;
  Settings: undefined;
};

export interface RepostData {
  originalPost: Post;
  screenshotUri: string;
}
