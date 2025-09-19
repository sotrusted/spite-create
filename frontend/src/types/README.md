# TypeScript Types Documentation

This file contains all the TypeScript interfaces and types used throughout the app. Think of these as "contracts" that define what data looks like.

## 🎯 What Are TypeScript Types?

TypeScript types are like blueprints that tell you:
- What properties an object has
- What type each property is (string, number, boolean, etc.)
- Which properties are required vs optional

This prevents bugs by catching errors at compile time instead of runtime.

## 📋 Main Types Explained

### User Type
```tsx
export interface User {
  handle: string;              // Username like "aqua-otter-931"
  avatar_color: string;        // Hex color like "#FF6B6B"
  is_anonymous_mode: boolean;  // true = anonymous, false = full account
  date_joined: string;         // ISO date string
  posts_count_today: number;   // Number of posts made today
}
```

**When to use**: Any time you're working with user data
**Example usage**:
```tsx
const [user, setUser] = useState<User | null>(null);
//                                    ^^^^^ Can be User object or null

function displayUser(userData: User) {
  return `@${userData.handle}`;  // TypeScript knows handle exists
}
```

### Author Type (Simplified User)
```tsx
export interface Author {
  handle: string;
  avatar_color: string;
}
```

**When to use**: For displaying post authors (lighter than full User object)
**Why separate**: Posts don't need full user data, just display info

### Post Type
```tsx
export interface Post {
  id: string;                    // Unique post identifier
  author: Author;                // Who created the post
  text_content: string;          // The actual text
  font_choice: 'impact' | 'mono' | 'rounded' | 'serif' | 'system'; // Font options
  font_size: number;             // Size in pixels
  text_color: string;            // Hex color
  background_color: string;      // Hex color
  background_gradient?: string[]; // Optional gradient colors
  has_outline: boolean;          // Text outline on/off
  outline_color: string;         // Outline color
  rendered_image_url?: string;   // URL to generated image
  created_at: string;            // ISO date string
  view_count: number;            // How many times viewed
}
```

**Type explanations**:
- **`'impact' | 'mono' | ...`**: Union type - only these specific strings allowed
- **`background_gradient?: string[]`**: The `?` means optional, `[]` means array of strings
- **`rendered_image_url?: string`**: Optional because image might still be generating

### PostCreate Type (For API Calls)
```tsx
export interface PostCreate {
  text_content: string;
  font_choice: 'impact' | 'mono' | 'rounded' | 'serif' | 'system';
  font_size: number;
  text_color: string;
  background_color: string;
  background_gradient?: string[];
  has_outline: boolean;
  outline_color: string;
}
```

**Why separate from Post**: 
- API creates posts without `id`, `author`, `created_at` etc.
- These fields are added by the backend
- Keeps frontend/backend contracts clear

### FeedResponse Type
```tsx
export interface FeedResponse {
  results: Post[];        // Array of posts
  next: string | null;    // URL for next page (pagination)
  previous: string | null; // URL for previous page
}
```

**When to use**: When fetching posts from the feed API
**Null values**: `null` when there's no next/previous page

### Navigation Types
```tsx
export type RootStackParamList = {
  MainTabs: undefined;                    // No parameters
  PostComposer: undefined;
  PostDetail: { postId: string };        // Requires postId parameter
};

export type TabParamList = {
  Feed: undefined;
  Post: undefined;
  Profile: undefined;
  Settings: undefined;
};
```

**What these do**: Tell TypeScript what parameters each screen expects
**`undefined`**: Screen doesn't need any parameters
**`{ postId: string }`**: Screen requires a postId parameter

## 🔧 How to Use Types

### 1. Function Parameters
```tsx
// Without types (bad - can cause errors)
function displayPost(post) {
  return post.titel;  // Typo! Should be "title" but no error shown
}

// With types (good - catches typos)
function displayPost(post: Post) {
  return post.title;  // TypeScript error: Property 'title' does not exist
  return post.text_content;  // Correct - TypeScript knows this exists
}
```

### 2. State Variables
```tsx
// Array of posts
const [posts, setPosts] = useState<Post[]>([]);

// Single post (can be null)
const [currentPost, setCurrentPost] = useState<Post | null>(null);

// Optional user
const [user, setUser] = useState<User | undefined>(undefined);
```

### 3. API Responses
```tsx
// Tell TypeScript what the API returns
const fetchPosts = async (): Promise<FeedResponse> => {
  const response = await api.get<FeedResponse>('/feed/');
  return response.data;  // TypeScript knows this is FeedResponse
};

// Using the response
const feedData = await fetchPosts();
console.log(feedData.results);    // TypeScript knows this is Post[]
console.log(feedData.invalid);    // TypeScript error: Property doesn't exist
```

### 4. Component Props
```tsx
interface Props {
  post: Post;                           // Required post
  onPress?: () => void;                 // Optional function
  isHighlighted?: boolean;              // Optional boolean
}

function PostCard({ post, onPress, isHighlighted = false }: Props) {
  return (
    <TouchableOpacity onPress={onPress}>
      <Text style={{ 
        fontWeight: isHighlighted ? 'bold' : 'normal' 
      }}>
        {post.text_content}
      </Text>
    </TouchableOpacity>
  );
}
```

## 📝 Creating New Types

### When to Create a New Type
1. **New data from API**: Create interface for the response
2. **Repeated object shape**: Extract to reusable type
3. **Component props**: Create Props interface
4. **Complex state**: Define shape of state object

### Example: Adding Comments Feature
```tsx
// 1. Create Comment type
export interface Comment {
  id: string;
  post_id: string;
  author: Author;
  content: string;
  created_at: string;
}

// 2. Create API response type
export interface CommentsResponse {
  results: Comment[];
  next: string | null;
  previous: string | null;
}

// 3. Update Post type to include comment count
export interface Post {
  // ... existing properties
  comment_count: number;  // Add this
}

// 4. Create component props
interface CommentListProps {
  postId: string;
  comments: Comment[];
  onLoadMore: () => void;
}
```

## 🚨 Common Type Errors and Solutions

### Error: "Property does not exist"
```tsx
// Error: Property 'username' does not exist on type 'User'
console.log(user.username);

// Solution: Check the type definition - User has 'handle', not 'username'
console.log(user.handle);
```

### Error: "Type 'null' is not assignable"
```tsx
// Error: user might be null
function displayUser(user: User | null) {
  return user.handle;  // Error: user might be null
}

// Solution: Check for null first
function displayUser(user: User | null) {
  if (!user) return 'Anonymous';
  return user.handle;  // Now TypeScript knows user is not null
}

// Or use optional chaining
function displayUser(user: User | null) {
  return user?.handle || 'Anonymous';
}
```

### Error: "Argument of type 'string' is not assignable"
```tsx
// Error: TypeScript expects specific values
const post: Post = {
  font_choice: 'comic-sans',  // Error: not in allowed values
  // ...
};

// Solution: Use allowed values
const post: Post = {
  font_choice: 'impact',  // Correct: one of the allowed values
  // ...
};
```

## 🎯 Type Best Practices

### 1. Be Specific with Union Types
```tsx
// Vague (bad)
type Status = string;

// Specific (good)
type Status = 'loading' | 'success' | 'error';
```

### 2. Use Optional Properties Wisely
```tsx
// If property might not exist, mark it optional
interface ApiResponse {
  data: Post[];
  error?: string;  // Only exists if there's an error
}
```

### 3. Extend Existing Types
```tsx
// Extend Post with additional UI state
interface PostWithUIState extends Post {
  isExpanded: boolean;
  isHighlighted: boolean;
}
```

### 4. Use Generic Types for Reusability
```tsx
// Generic API response type
interface ApiResponse<T> {
  data: T;
  status: 'success' | 'error';
  message?: string;
}

// Usage
type PostResponse = ApiResponse<Post>;
type UserResponse = ApiResponse<User>;
```

## 🔄 Updating Types

### When Backend Changes
1. **New field added**: Add to interface with `?` if optional
2. **Field removed**: Remove from interface
3. **Field type changed**: Update type definition
4. **New endpoint**: Create new response type

### Migration Strategy
```tsx
// Old type
interface OldPost {
  title: string;
  content: string;
}

// New type (keeping backward compatibility)
interface Post {
  title?: string;        // Made optional for transition
  text_content: string;  // New field name
  content?: string;      // Keep old field during migration
}
```

This documentation should help you understand and work with TypeScript types as the app grows. The key is to start simple and add more specific types as needed!

