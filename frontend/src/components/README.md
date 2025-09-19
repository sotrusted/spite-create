# Components Documentation

This folder contains reusable UI components for the TBD app.

## 📱 Component Overview

### 1. PostComposer.tsx
**The main post creation interface with Instagram/Snapchat-style controls.**

#### What it does:
- Full-screen post creation experience
- Touch gesture controls (pinch-to-scale, drag-to-move)
- Text styling options (fonts, colors, outlines)
- Real-time preview of how post will look
- Form validation and API submission

#### Key Props:
```tsx
interface Props {
  onPost?: (post: any) => void;  // Called when post is created
  onClose?: () => void;          // Called when user closes composer
}
```

#### State Variables Explained:
```tsx
// Text content and styling
const [textContent, setTextContent] = useState('');           // What user types
const [fontChoice, setFontChoice] = useState('impact');       // Selected font
const [fontSize, setFontSize] = useState(48);                 // Base font size
const [textColor, setTextColor] = useState('#FFFFFF');       // Text color
const [backgroundColor, setBackgroundColor] = useState('#000000'); // Background

// Gesture controls for touch interaction
const [textScale, setTextScale] = useState(1);               // Scale from pinch gesture
const [textPosition, setTextPosition] = useState({x: 0, y: 0}); // Position from drag

// UI state
const [isPosting, setIsPosting] = useState(false);           // Show loading state
const [showColorPicker, setShowColorPicker] = useState(null); // Which color picker is open
```

#### Key Functions:
- **`handlePost()`**: Validates and submits post to API
- **`pinchGesture`**: Handles pinch-to-scale touch input
- **`panGesture`**: Handles drag-to-move touch input
- **`renderPreview()`**: Shows live preview of styled text

#### How to modify:
- **Add new fonts**: Update `FontChoices` in `constants/colors.ts`
- **Add new colors**: Update `Colors.postColors` array
- **Change gesture sensitivity**: Modify scale limits in `updateFontSizeFromScale`
- **Add new styling options**: Add state variables and UI controls

---

### 2. Feed.tsx
**The main feed component that displays posts in chronological order.**

#### What it does:
- Fetches posts from API with pagination
- Displays infinite scrolling list
- Handles real-time updates via WebSocket
- Pull-to-refresh functionality
- Manages loading and error states

#### Key Props:
```tsx
interface Props {
  newPost?: Post | null;           // New post from composer to add to feed
  onNewPostDisplayed?: () => void; // Callback when new post is shown
}
```

#### State Variables Explained:
```tsx
const [posts, setPosts] = useState<Post[]>([]);          // Array of posts to display
const [loading, setLoading] = useState(true);           // Initial loading state
const [refreshing, setRefreshing] = useState(false);    // Pull-to-refresh state
const [loadingMore, setLoadingMore] = useState(false);  // Loading more posts state
const [nextUrl, setNextUrl] = useState<string | null>(null); // Pagination cursor
const [error, setError] = useState<string | null>(null);     // Error message
```

#### Key Functions:
- **`fetchFeed()`**: Loads posts from API with pagination
- **`handleRefresh()`**: Pull-to-refresh implementation
- **`handleLoadMore()`**: Infinite scroll pagination
- **`handlePostAction()`**: Handles report/mute actions

#### How to modify:
- **Change pagination size**: Modify `PAGE_SIZE` in API config
- **Add new post actions**: Add buttons and handlers in `PostCard`
- **Change refresh behavior**: Modify `handleRefresh()` function
- **Add filtering**: Add filter state and modify `fetchFeed()`

---

### 3. PostCard.tsx
**Individual post display component with interaction controls.**

#### What it does:
- Displays post content (image and metadata)
- Shows author information (handle, avatar)
- Handles long-press interactions (report, mute, copy)
- Formats timestamps ("2h ago")
- Modal action sheets for interactions

#### Key Props:
```tsx
interface Props {
  post: Post;                                    // Post data to display
  onReport: (reason: string, description: string) => void; // Report callback
  onMute: () => void;                           // Mute user callback
  onCopyText: () => void;                       // Copy text callback
}
```

#### State Variables Explained:
```tsx
const [showActions, setShowActions] = useState(false);      // Show action menu
const [showReportModal, setShowReportModal] = useState(false); // Show report form
```

#### Key Functions:
- **`formatTimeAgo()`**: Converts timestamps to "2h ago" format
- **`handleLongPress()`**: Shows action menu on long press
- **`handleCopyText()`**: Copies post text to clipboard
- **`handleReport()`**: Reports post with reason
- **`handleMute()`**: Mutes the post author

#### How to modify:
- **Add new actions**: Add buttons to action sheet and handlers
- **Change post layout**: Modify the render structure
- **Add post interactions**: Add state and handlers for likes, comments, etc.
- **Change time format**: Modify `formatTimeAgo()` function

---

## 🔄 Component Communication Patterns

### Parent → Child (Props)
```tsx
// Parent passes data down to child
function ParentComponent() {
  const [data, setData] = useState('Hello');
  
  return <ChildComponent title={data} />;
}

// Child receives data via props
function ChildComponent({ title }: { title: string }) {
  return <Text>{title}</Text>;
}
```

### Child → Parent (Callback Props)
```tsx
// Parent provides callback function
function ParentComponent() {
  const handleChildAction = (data: string) => {
    console.log('Child said:', data);
  };
  
  return <ChildComponent onAction={handleChildAction} />;
}

// Child calls parent function
function ChildComponent({ onAction }: { onAction: (data: string) => void }) {
  return (
    <TouchableOpacity onPress={() => onAction('Hello!')}>
      <Text>Press me</Text>
    </TouchableOpacity>
  );
}
```

### Sibling Communication (Lift State Up)
```tsx
// Parent manages shared state
function ParentComponent() {
  const [sharedData, setSharedData] = useState('');
  
  return (
    <View>
      <ComponentA data={sharedData} onChange={setSharedData} />
      <ComponentB data={sharedData} />
    </View>
  );
}
```

## 🎨 Styling Patterns

### Using StyleSheet
```tsx
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  // Always use camelCase for style property names
  primaryButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
  },
});
```

### Conditional Styles
```tsx
<View style={[
  styles.button,
  isActive && styles.buttonActive,  // Add style if condition is true
  { opacity: isDisabled ? 0.5 : 1 } // Inline style object
]} />
```

### Responsive Styles
```tsx
const { width: screenWidth } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    width: screenWidth * 0.9,  // 90% of screen width
  },
});
```

## 🔍 Common Debugging Tips

### State Issues
```tsx
// Log state changes
useEffect(() => {
  console.log('Posts updated:', posts);
}, [posts]);

// Check if component is re-rendering too much
console.log('Component rendered');
```

### Prop Issues
```tsx
// Check if props are being passed correctly
function MyComponent(props) {
  console.log('Received props:', props);
  return <View />;
}
```

### Style Issues
```tsx
// Add border to see component boundaries
debugStyle: {
  borderWidth: 1,
  borderColor: 'red',
}
```

## 🚀 Performance Tips

### Optimize Re-renders
```tsx
// Use React.memo for components that don't change often
export default React.memo(PostCard);

// Use useCallback for functions passed as props
const handlePress = useCallback(() => {
  // function logic
}, [dependencies]);

// Use useMemo for expensive calculations
const expensiveValue = useMemo(() => {
  return calculateSomething(data);
}, [data]);
```

### Optimize Lists
```tsx
<FlatList
  data={posts}
  renderItem={renderPost}
  keyExtractor={(item) => item.id}  // Always provide unique keys
  getItemLayout={getItemLayout}     // If items have fixed height
  removeClippedSubviews={true}      // Remove off-screen items
  maxToRenderPerBatch={10}          // Render in smaller batches
/>
```

This documentation should help you understand how each component works and how to modify them as your app grows!

