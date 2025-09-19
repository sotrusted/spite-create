export interface User {
  handle: string;
  avatar_color: string;
  is_anonymous_mode: boolean;
  date_joined: string;
  posts_count_today: number;
  report_count?: number;
  is_shadowbanned?: boolean;
  shadowban_reason?: string;
}

export interface Author {
  handle: string;
  avatar_color: string;
}

export interface Post {
  id: string;
  author: Author;
  text_content: string;
  font_choice: 'impact' | 'mono' | 'rounded' | 'serif' | 'system';
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
}

export interface TextElement {
  content: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily: 'arial-black' | 'crimson-text' | 'papyrus' | 'impact';
  hasBackground: boolean;
  backgroundColor: string;
}

export interface PostCreate {
  text_content: string;
  text_elements?: TextElement[]; // NEW: Array of positioned text elements
  font_choice: 'arial-black' | 'crimson-text' | 'papyrus' | 'impact';
  font_size: number;
  text_color: string;
  background_color: string;
  background_gradient?: string[];
  has_outline: boolean;
  outline_color: string;
  has_text_background?: boolean;
  text_background_color?: string;
  canvas_width: number;
  canvas_height: number;
  repost_data?: {
    original_post_id: string;
    screenshot_uri: string;
    repost_geometry?: {
      x: number;
      y: number;
      scale: number;
    };
  };
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
