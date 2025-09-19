# TBD Frontend Guide - React Native/TypeScript for Beginners

This guide explains the frontend architecture for someone with minimal TypeScript/React experience. It's designed to help you understand and modify the code as the app grows.

## 🎯 Table of Contents

1. [Basic Concepts](#basic-concepts)
2. [Understanding useState - The Magic of State](#understanding-usestate)
3. [Prop Drilling - How Data Flows](#prop-drilling)
4. [New App Architecture](#new-app-architecture)
5. [Component Breakdown](#component-breakdown)
6. [Navigation](#navigation)
7. [Repost Feature](#repost-feature)
8. [API Integration](#api-integration)
9. [Styling System](#styling-system)
10. [How to Modify Things](#how-to-modify-things)

---

## 📚 Basic Concepts

### What is React Native?

- **React Native**: Build mobile apps using JavaScript/TypeScript
- **Components**: Reusable pieces of UI (like LEGO blocks)
- **Props**: Data passed between components (like function parameters)
- **State**: Data that can change over time (like variables that trigger UI updates)
- **Hooks**: Special functions that let you "hook into" React features

### What is TypeScript?

- **TypeScript**: JavaScript with type checking (prevents many bugs)
- **Interfaces**: Define the shape of data objects
- **Types**: Specify what kind of data a variable can hold
- **Optional Properties**: Properties that might or might not exist (marked with `?`)Key React Native Components

```tsx
import { View, Text, TouchableOpacity } from 'react-native';

// View = like a <div> in HTML (container)
// Text = displays text (only component that can show text)
// TouchableOpacity = button that responds to taps
```

---

## 🎛️ Understanding useState - The Magic of State

**useState is the heart of React**. Think of it like a magic box that:

1. **Holds a value** that can change over time
2. **Automatically updates the UI** when the value changes
3. **Remembers the value** between renders

### 🧠 Mental Model: useState as a Smart Variable

```tsx
// Regular JavaScript variable (doesn't work in React)
let count = 0;
count = count + 1;  // Changes the value...
// BUT: React doesn't know it changed, so UI doesn't update!

// React useState (works perfectly)
const [count, setCount] = useState(0);
setCount(count + 1);  // Changes the value AND tells React to update UI!
```

### 🔍 Breaking Down useState Syntax

```tsx
const [currentValue, functionToChangeIt] = useState(initialValue);
//     ^what you read  ^what you call        ^starting value
```

**Real Example:**

```tsx
const [textContent, setTextContent] = useState('');
//     ^current text  ^function to update text  ^starts empty

// Reading the value
console.log(textContent);  // Shows current text

// Changing the value
setTextContent('Hello!');  // Updates text AND refreshes UI
```

### 🎭 useState in Action - PostComposer Example

Let's look at the PostComposer to see useState working:

```tsx
export default function PostComposer() {
  // Each useState creates a piece of "state"
  const [textContent, setTextContent] = useState('');           // What user types
  const [fontSize, setFontSize] = useState(48);                 // Size of text
  const [textColor, setTextColor] = useState('#FFFFFF');       // Color of text
  const [isPosting, setIsPosting] = useState(false);           // Is post being sent?
  const [hasTextBackground, setHasTextBackground] = useState(false); // Instagram-style text bg
  
  // When user types in TextInput, this function runs
  const handleTextChange = (newText: string) => {
    setTextContent(newText);  // Update the state
    // React automatically re-renders the component with new text!
  };
  
  // When user toggles text background, this function runs
  const toggleTextBackground = () => {
    setHasTextBackground(!hasTextBackground);  // Flip true/false
    // UI automatically updates to show/hide background option!
  };
  
  // When user taps Post button, this function runs
  const handlePost = () => {
    setIsPosting(true);       // Show loading spinner
    // ... send to API ...
    setIsPosting(false);      // Hide loading spinner
  };

  return (
    <View>
      {/* This TextInput is "connected" to state */}
      <TextInput
        value={textContent}           // Shows current state value
        onChangeText={handleTextChange}  // Updates state when user types
      />
    
      {/* This Text automatically shows updated content */}
      <Text style={{ 
        backgroundColor: hasTextBackground ? '#FF6B6B' : 'transparent' 
      }}>
        {textContent}
      </Text>
    
      {/* This checkbox is connected to state */}
      <TouchableOpacity onPress={toggleTextBackground}>
        <Text>Add text background: {hasTextBackground ? '✅' : '☐'}</Text>
      </TouchableOpacity>
    
      {/* This button changes based on isPosting state */}
      <TouchableOpacity onPress={handlePost}>
        {isPosting ? (
          <ActivityIndicator />    // Show spinner when posting
        ) : (
          <Text>Post</Text>        // Show text when not posting
        )}
      </TouchableOpacity>
    </View>
  );
}
```

### ⚡ Why useState is "Magic"

1. **Automatic UI Updates**: When state changes, React re-renders only the parts that need updating
2. **Preserves Values**: State persists between re-renders (unlike regular variables)
3. **Triggers Effects**: Other hooks like useEffect can react to state changes

### 🚫 Common useState Mistakes

```tsx
// ❌ WRONG: Don't modify state directly
const [posts, setPosts] = useState([]);
posts.push(newPost);  // React doesn't know about this change!

// ✅ CORRECT: Always use the setter function
setPosts([...posts, newPost]);  // React knows and updates UI

// ❌ WRONG: Don't call useState in loops or conditions
if (someCondition) {
  const [temp, setTemp] = useState(0);  // Breaks React's rules!
}

// ✅ CORRECT: Always call useState at the top level
const [temp, setTemp] = useState(0);
if (someCondition) {
  setTemp(5);  // This is fine!
}
```

---

## 🔄 Prop Drilling - How Data Flows

**Prop drilling** is how data moves from parent components down to child components. Think of it like passing notes in class - the message goes from person to person until it reaches the target.

### 🎭 The Chain of Communication

```tsx
// Level 1: App (has the data)
function App() {
  const [user, setUser] = useState({ name: 'Alice', avatar: '#FF6B6B' });
  
  return <MainScreen user={user} />;  // Pass data down to MainScreen
}

// Level 2: MainScreen (receives data, passes it further)
function MainScreen({ user }) {
  return <Feed user={user} />;  // Pass data down to Feed
}

// Level 3: Feed (receives data, passes it further)
function Feed({ user }) {
  const posts = [...];  // Some posts data
  
  return (
    <FlatList
      data={posts}
      renderItem={({ item }) => (
        <PostCard post={item} currentUser={user} />  // Pass to each PostCard
      )}
    />
  );
}

// Level 4: PostCard (finally uses the data!)
function PostCard({ post, currentUser }) {
  return (
    <View>
      <Text>Posted by: {post.author}</Text>
      {post.author === currentUser.name && (
        <Text>This is your post!</Text>
      )}
    </View>
  );
}
```

### 🔄 The Complete Circle: Child to Parent Communication

Data doesn't just flow down - children can send data back up through **callback functions**:

```tsx
// Parent defines what to do when child sends data
function Parent() {
  const [message, setMessage] = useState('');
  
  const handleChildMessage = (childData: string) => {
    setMessage(childData);  // Update parent state with child's data
  };
  
  return (
    <View>
      <Text>Child said: {message}</Text>
      <Child onSendMessage={handleChildMessage} />  {/* Pass callback down */}
    </View>
  );
}

// Child calls the callback to send data up
function Child({ onSendMessage }) {
  const sendDataToParent = () => {
    onSendMessage('Hello from child!');  // Call parent's function
  };
  
  return (
    <TouchableOpacity onPress={sendDataToParent}>
      <Text>Send Message Up</Text>
    </TouchableOpacity>
  );
}
```

---

## 🎨 New App Architecture (No More Bottom Tabs!)

We've completely redesigned the app to feel more modern and focused:

### 🏗️ Old vs New Structure

**❌ Old (Bottom Tab) Structure:**

```
App
└── TabNavigator (4 tabs taking up screen space)
    ├── Feed Tab
    ├── Post Tab
    ├── Profile Tab
    └── Settings Tab
```

**✅ New (Floating Button) Structure:**

```
App
└── Stack Navigator (clean, modal-based)
    ├── MainScreen (Feed + Header + FloatingButton)
    ├── PostComposer (Modal)
    ├── Profile (Modal)
    └── Settings (Modal)
```

### 📱 New User Experience

1. **Clean Main Screen**: Just the feed with a collapsible header
2. **Twitter-Style Floating Button**: Bottom-right corner for posting
3. **Collapsible Header**: Disappears on scroll down, reappears on scroll up
4. **Modal Screens**: Profile and settings slide up as modals

### 🎯 MainScreen Component

```tsx
function MainScreen() {
  const [newPost, setNewPost] = useState<Post | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  
  // Handle scroll to hide/show header
  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: false,
      listener: (event) => {
        const currentScrollY = event.nativeEvent.contentOffset.y;
        const diff = currentScrollY - lastScrollY.current;

        if (diff > 0 && currentScrollY > 100) {
          // Hide header when scrolling down
          Animated.timing(headerTranslateY, {
            toValue: -80,
            duration: 200,
            useNativeDriver: true,
          }).start();
        } else if (diff < 0) {
          // Show header when scrolling up
          Animated.timing(headerTranslateY, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start();
        }
      },
    }
  );

  return (
    <View style={styles.container}>
      {/* Collapsible Header */}
      <Animated.View style={[styles.header, { transform: [{ translateY: headerTranslateY }] }]}>
        <Text style={styles.appTitle}>TBD</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Ionicons name="person-circle-outline" size={28} />
        </TouchableOpacity>
      </Animated.View>

      {/* Feed with scroll handling */}
      <Feed onScroll={handleScroll} />

      {/* Floating Post Button */}
      <TouchableOpacity 
        style={styles.floatingButton}
        onPress={() => navigation.navigate('PostComposer')}
      >
        <Ionicons name="add" size={28} />
      </TouchableOpacity>
    </View>
  );
}
```

---

## 🔄 Repost Feature - Screenshot & Response Canvas

One of TBD's unique features is the **automatic screenshot repost** functionality, similar to quote tweets but more visual.

### 🎯 How Repost Works

1. **User long-presses a post** → Action menu appears
2. **User taps "Repost"** → App captures screenshot of the post
3. **PostComposer opens** with screenshot as background
4. **User adds response text** over the screenshot
5. **Posts as a repost** with original post reference

### 📸 Screenshot Capture Implementation

```tsx
// In PostCard.tsx
import { captureRef } from 'react-native-view-shot';

function PostCard({ post }) {
  const postRef = useRef<View>(null);  // Reference to the post container
  
  const handleRepost = async () => {
    try {
      // Capture screenshot of the post
      const uri = await captureRef(postRef, {
        format: 'png',
        quality: 0.8,
      });
    
      // Navigate to PostComposer with screenshot
      navigation.navigate('PostComposer', {
        repostData: {
          originalPost: post,
          screenshotUri: uri,
        },
      });
    
    } catch (error) {
      Alert.alert('Error', 'Failed to capture post for reposting');
    }
  };

  return (
    <View style={styles.container}>
      {/* This View gets captured as screenshot */}
      <View ref={postRef} style={styles.captureContainer}>
        <View style={styles.header}>
          <Text>@{post.author.handle}</Text>
        </View>
        <Image source={{ uri: post.rendered_image_url }} />
        <Text>{post.text_content}</Text>
      </View>
    </View>
  );
}
```

### 🎨 Repost Canvas Implementation

```tsx
// In PostComposer.tsx
function PostComposer({ repostData }) {
  const renderPreview = () => {
    // If this is a repost, show screenshot as background
    if (repostData) {
      return (
        <View style={styles.previewContainer}>
          {/* Original post screenshot as background */}
          <Image 
            source={{ uri: repostData.screenshotUri }}
            style={styles.repostBackground}
            resizeMode="cover"
          />
        
          {/* Semi-transparent overlay */}
          <View style={styles.repostOverlay}>
            {/* User's response text on top */}
            <GestureDetector gesture={composedGestures}>
              <Animated.View style={[styles.textContainer, animatedTextStyle]}>
                <Animated.Text style={getPreviewStyle()}>
                  {textContent || 'Add your response...'}
                </Animated.Text>
              </Animated.View>
            </GestureDetector>
          </View>
        </View>
      );
    }
  
    // Normal post creation...
  };
}
```

---

## 🎨 Instagram-Style Text Background Boxes

We've added Instagram Stories-style text background boxes for more visual creativity.

### 🎛️ Implementation

```tsx
function PostComposer() {
  const [hasTextBackground, setHasTextBackground] = useState(false);
  const [textBackgroundColor, setTextBackgroundColor] = useState('#FF6B6B');
  
  const getPreviewStyle = () => {
    return {
      fontSize: (fontSize * textScale) * 0.4,
      color: textColor,
      textAlign: 'center',
      // Instagram-style background box
      ...(hasTextBackground && {
        backgroundColor: textBackgroundColor,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        overflow: 'hidden',
      }),
    };
  };

  return (
    <View>
      {/* Toggle for text background */}
      <TouchableOpacity onPress={() => setHasTextBackground(!hasTextBackground)}>
        <Text>Add text background box</Text>
      </TouchableOpacity>
    
      {/* Color picker appears when enabled */}
      {hasTextBackground && (
        <TouchableOpacity onPress={() => setShowColorPicker('textBackground')}>
          <Text>Text Background Color</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
```

### What is React Native?

- **React Native**: Build mobile apps using JavaScript/TypeScript
- **Components**: Reusable pieces of UI (like LEGO blocks)
- **Props**: Data passed between components (like function parameters)
- **State**: Data that can change over time (like variables that trigger UI updates)
- **Hooks**: Special functions that let you "hook into" React features

### What is TypeScript?

- **TypeScript**: JavaScript with type checking (prevents many bugs)
- **Interfaces**: Define the shape of data objects
- **Types**: Specify what kind of data a variable can hold
- **Optional Properties**: Properties that might or might not exist (marked with `?`)

### Key React Native Components

```tsx
import { View, Text, TouchableOpacity } from 'react-native';

// View = like a <div> in HTML (container)
// Text = displays text (only component that can show text)
// TouchableOpacity = button that responds to taps
```

---

## 📁 Project Structure

```
frontend/src/
├── components/          # Reusable UI pieces
│   ├── Feed.tsx            # The main feed that shows posts
│   ├── PostCard.tsx        # Individual post display
│   └── PostComposer.tsx    # Create new posts screen
├── screens/            # Full screen views
│   ├── FeedScreen.tsx      # Feed tab screen
│   ├── PostComposerScreen.tsx  # Create tab screen
│   ├── ProfileScreen.tsx   # Profile tab screen
│   └── SettingsScreen.tsx  # Settings tab screen
├── config/            # Configuration files
│   └── api.ts             # API setup and endpoints
├── constants/         # App-wide constants
│   └── colors.ts          # Color palette and design tokens
├── services/         # External service integrations
│   └── websocket.ts       # Real-time WebSocket connection
└── types/           # TypeScript type definitions
    └── index.ts           # All the data shapes we use
```

### When to Put Code Where:

- **Components**: Reusable UI that appears in multiple places
- **Screens**: Full-page views that users navigate to
- **Config**: Settings and configuration
- **Constants**: Values that never change (colors, fonts, etc.)
- **Services**: Code that talks to external systems (APIs, WebSockets)
- **Types**: TypeScript definitions for data structures

---

## 🧩 Component Breakdown

### 1. App.tsx - The Root Component

```tsx
// This is the top-level component that wraps everything
export default function App() {
  return (
    <SafeAreaProvider>        // Handles phone notches/safe areas
      <NavigationContainer>   // Handles navigation between screens
        <Stack.Navigator>     // Stack navigation (like browser history)
          <Stack.Screen name="MainTabs" component={MainTabs} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
```

**What it does**: Sets up navigation and handles the app's overall structure.

### 2. MainTabs - Bottom Tab Navigation

```tsx
function MainTabs() {
  const [newPost, setNewPost] = useState<Post | null>(null);
  
  // This creates the bottom tab bar with 4 tabs
  return (
    <Tab.Navigator>
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Post" component={PostComposerScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
```

**What it does**: Creates the bottom tab bar and manages communication between tabs.

### 3. PostComposer.tsx - The Create Post Screen

This is the most complex component. Let me break it down:

```tsx
export default function PostComposer({ onPost, onClose }: Props) {
  // STATE - Variables that can change and trigger UI updates
  const [textContent, setTextContent] = useState('');     // The text user types
  const [fontChoice, setFontChoice] = useState('impact'); // Selected font
  const [fontSize, setFontSize] = useState(48);           // Size of text
  const [textColor, setTextColor] = useState('#FFFFFF');  // Color of text
  // ... more state variables
  
  // FUNCTIONS - Things the component can do
  const handlePost = async () => {
    // This function runs when user taps "Post" button
    // It sends data to the backend API
  };
  
  const handleColorSelect = (color: string) => {
    // This function runs when user picks a color
    // It updates the state with the new color
  };
  
  // RENDER - What gets displayed on screen
  return (
    <View style={styles.container}>
      {/* Header with close button and post button */}
      {/* Preview area with gesture controls */}
      {/* Text input area */}
      {/* Style controls (font, size, colors) */}
    </View>
  );
}
```

**Key Concepts Explained:**

#### State Variables:

```tsx
const [textContent, setTextContent] = useState('');
//     ^current value  ^function to change it  ^initial value
```

- When you call `setTextContent('new text')`, React re-renders the component with the new value
- This is how the UI stays in sync with data

#### Props (Data from Parent):

```tsx
interface Props {
  onPost?: (post: any) => void;  // Function to call when posting
  onClose?: () => void;          // Function to call when closing
}
```

- Props are like function parameters but for components
- The `?` means the prop is optional
- Parent components pass these down to child components

#### Event Handlers:

```tsx
const handlePost = async () => {
  // async = this function can wait for API calls
  try {
    const response = await api.post(endpoints.createPost, postData);
    // await = wait for the API call to finish
    onPost?.(response.data);  // The ?. means "call this if it exists"
  } catch (error) {
    // Handle errors
  }
};
```

### 4. Feed.tsx - The Main Feed

```tsx
export default function Feed({ newPost, onNewPostDisplayed }: Props) {
  const [posts, setPosts] = useState<Post[]>([]);  // Array of posts
  const [loading, setLoading] = useState(true);    // Is data loading?
  
  // EFFECTS - Code that runs when component mounts or data changes
  useEffect(() => {
    fetchFeed();  // Load posts when component first appears
  }, []);         // Empty array = only run once
  
  const fetchFeed = useCallback(async () => {
    // useCallback = optimize function so it doesn't recreate every render
    try {
      const response = await api.get<FeedResponse>(endpoints.getFeed);
      setPosts(response.data.results);
    } catch (error) {
      // Handle error
    }
  }, []);
  
  return (
    <FlatList
      data={posts}                    // Array of data to display
      renderItem={renderPost}         // Function to render each item
      keyExtractor={(item) => item.id} // Unique key for each item
      onRefresh={handleRefresh}       // Pull-to-refresh
      refreshing={refreshing}         // Show refresh spinner?
    />
  );
}
```

**Key Concepts:**

- **FlatList**: Efficiently renders large lists of data
- **useEffect**: Runs code when component mounts or dependencies change
- **useCallback**: Prevents functions from being recreated on every render (performance optimization)

### 5. PostCard.tsx - Individual Post Display

```tsx
export default function PostCard({ post, onReport, onMute, onCopyText }: Props) {
  const [showActions, setShowActions] = useState(false);  // Show action menu?
  
  const handleLongPress = () => {
    setShowActions(true);  // Show the report/mute menu
  };
  
  return (
    <View style={styles.container}>
      {/* Post header with user info */}
      <TouchableOpacity onLongPress={handleLongPress}>
        {/* Post image */}
      </TouchableOpacity>
      {/* Action sheet modal */}
    </View>
  );
}
```

---

## 🔄 State Management

### Local State (useState)

For data that only one component needs:

```tsx
const [count, setCount] = useState(0);
const [isVisible, setIsVisible] = useState(false);
const [user, setUser] = useState<User | null>(null);
```

### Prop Drilling (Current Approach)

Passing data down through component tree:

```tsx
// App.tsx
function MainTabs() {
  const [newPost, setNewPost] = useState<Post | null>(null);
  
  return (
    <Tab.Screen name="Feed">
      {() => <FeedScreen newPost={newPost} />}
    </Tab.Screen>
  );
}

// FeedScreen.tsx
function FeedScreen({ newPost }: Props) {
  return <Feed newPost={newPost} />;
}

// Feed.tsx
function Feed({ newPost }: Props) {
  // Use the newPost data here
}
```

### When You'll Need Better State Management:

- **Context API**: When many components need the same data
- **Redux/Zustand**: When state logic becomes complex
- **React Query**: For server state management (API data)

---

## 🧭 Navigation

### Navigation Structure:

```
App
└── Stack Navigator (for modals)
    └── Tab Navigator (bottom tabs)
        ├── Feed Tab
        ├── Post Tab  
        ├── Profile Tab
        └── Settings Tab
```

### Navigation Commands:

```tsx
import { useNavigation } from '@react-navigation/native';

function SomeComponent() {
  const navigation = useNavigation();
  
  // Go to another screen
  navigation.navigate('ScreenName');
  
  // Go back
  navigation.goBack();
  
  // Reset the entire navigation stack
  navigation.reset({
    index: 0,
    routes: [{ name: 'Home' }],
  });
}
```

### Navigation with Parameters:

```tsx
// Navigate with data
navigation.navigate('PostDetail', { postId: '123' });

// Receive data in target screen
function PostDetailScreen({ route }) {
  const { postId } = route.params;
}
```

---

## 🌐 API Integration

### API Setup (config/api.ts)

```tsx
import axios from 'axios';

// Create axios instance with default config
export const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'X-Device-ID': getDeviceId(),  // Unique device identifier
  },
});

// Define API endpoints
export const endpoints = {
  createPost: '/posts/',
  getFeed: '/feed/',
  getPost: (id: string) => `/posts/${id}/`,
};
```

### Making API Calls:

```tsx
// GET request
const fetchPosts = async () => {
  try {
    const response = await api.get<FeedResponse>(endpoints.getFeed);
    return response.data;  // TypeScript knows this is FeedResponse type
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

// POST request
const createPost = async (postData: PostCreate) => {
  try {
    const response = await api.post<Post>(endpoints.createPost, postData);
    return response.data;  // TypeScript knows this is Post type
  } catch (error) {
    throw error;
  }
};
```

### Error Handling Patterns:

```tsx
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const handleApiCall = async () => {
  try {
    setLoading(true);
    setError(null);
  
    const result = await someApiCall();
  
    // Handle success
  } catch (error: any) {
    const errorMessage = error.response?.data?.error || 'Something went wrong';
    setError(errorMessage);
  
    // Show user-friendly error
    Toast.show({
      type: 'error',
      text1: 'Error',
      text2: errorMessage,
    });
  } finally {
    setLoading(false);
  }
};
```

---

## 🎨 Styling System

### StyleSheet Pattern:

```tsx
import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,                    // Take up available space
    backgroundColor: '#000',    // Black background
    padding: 16,               // 16px padding on all sides
  },
  text: {
    color: '#FFF',             // White text
    fontSize: 16,              // 16px font size
    fontWeight: 'bold',        // Bold text
    textAlign: 'center',       // Center align
  },
  button: {
    backgroundColor: '#4ECDC4', // Teal background
    borderRadius: 8,           // Rounded corners
    paddingHorizontal: 24,     // Left/right padding
    paddingVertical: 12,       // Top/bottom padding
  },
});
```

### Flexbox Layout (React Native's main layout system):

```tsx
const styles = StyleSheet.create({
  // Container that arranges children vertically
  column: {
    flexDirection: 'column',    // Stack items vertically (default)
    justifyContent: 'center',   // Center items vertically
    alignItems: 'center',       // Center items horizontally
  },
  
  // Container that arranges children horizontally
  row: {
    flexDirection: 'row',       // Arrange items horizontally
    justifyContent: 'space-between', // Space items apart
    alignItems: 'center',       // Center items vertically
  },
  
  // Item that takes up available space
  flexible: {
    flex: 1,                    // Grow to fill available space
  },
});
```

### Using the Color System:

```tsx
import { Colors } from '../constants/colors';

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,  // #000000
  },
  text: {
    color: Colors.primary,              // #FFFFFF  
  },
  accent: {
    backgroundColor: Colors.accent,      // #4ECDC4
  },
});
```

---

## 🔄 Common Patterns

### 1. Loading States:

```tsx
function SomeComponent() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  
  useEffect(() => {
    fetchData();
  }, []);
  
  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await api.get('/data');
      setData(result.data);
    } catch (error) {
      // Handle error
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text>Loading...</Text>
      </View>
    );
  }
  
  return (
    <View>
      {/* Render data */}
    </View>
  );
}
```

### 2. Conditional Rendering:

```tsx
function UserProfile({ user }) {
  return (
    <View>
      {user ? (
        <Text>Welcome, {user.name}!</Text>
      ) : (
        <Text>Please log in</Text>
      )}
  
      {user && user.isAdmin && (
        <Text>Admin Panel</Text>
      )}
  
      {posts.length > 0 ? (
        <FlatList data={posts} ... />
      ) : (
        <Text>No posts yet</Text>
      )}
    </View>
  );
}
```

### 3. Form Handling:

```tsx
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  
  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
  
    if (!email) newErrors.email = 'Email is required';
    if (!password) newErrors.password = 'Password is required';
  
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = () => {
    if (validateForm()) {
      // Submit form
    }
  };
  
  return (
    <View>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        style={[styles.input, errors.email && styles.inputError]}
      />
      {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
  
      <TouchableOpacity onPress={handleSubmit} style={styles.button}>
        <Text>Submit</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### 4. List Rendering:

```tsx
function PostList({ posts }) {
  const renderPost = ({ item: post }) => (
    <PostCard
      key={post.id}
      post={post}
      onPress={() => navigation.navigate('PostDetail', { postId: post.id })}
    />
  );
  
  return (
    <FlatList
      data={posts}
      renderItem={renderPost}
      keyExtractor={(item) => item.id}
      onEndReached={loadMore}        // Load more when scrolling to bottom
      onEndReachedThreshold={0.5}    // Trigger when 50% from bottom
      refreshControl={               // Pull to refresh
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      }
    />
  );
}
```

---

## 🛠️ How to Modify Things

### Adding a New Screen:

1. **Create the screen file**: `src/screens/NewScreen.tsx`

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function NewScreen() {
  return (
    <View style={styles.container}>
      <Text>New Screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
```

2. **Add to navigation** in `App.tsx`:

```tsx
<Tab.Screen 
  name="NewScreen" 
  component={NewScreen}
  options={{
    title: 'New',
    tabBarIcon: ({ focused, color, size }) => (
      <Ionicons name="add" size={size} color={color} />
    ),
  }}
/>
```

### Adding a New Component:

1. **Create component file**: `src/components/NewComponent.tsx`

```tsx
import React from 'react';
import { View, Text } from 'react-native';

interface Props {
  title: string;
  onPress?: () => void;
}

export default function NewComponent({ title, onPress }: Props) {
  return (
    <View>
      <Text>{title}</Text>
    </View>
  );
}
```

2. **Use in other components**:

```tsx
import NewComponent from '../components/NewComponent';

function SomeScreen() {
  return (
    <View>
      <NewComponent 
        title="Hello World" 
        onPress={() => console.log('Pressed!')} 
      />
    </View>
  );
}
```

### Adding New API Endpoints:

1. **Add to endpoints** in `src/config/api.ts`:

```tsx
export const endpoints = {
  // ... existing endpoints
  newEndpoint: '/new-endpoint/',
  newEndpointWithParam: (id: string) => `/new-endpoint/${id}/`,
};
```

2. **Create API function**:

```tsx
export const fetchNewData = async () => {
  const response = await api.get(endpoints.newEndpoint);
  return response.data;
};
```

### Adding New Types:

1. **Add to** `src/types/index.ts`:

```tsx
export interface NewDataType {
  id: string;
  name: string;
  createdAt: string;
  isActive?: boolean;  // Optional field
}
```

2. **Use in components**:

```tsx
const [data, setData] = useState<NewDataType[]>([]);
```

### Modifying Styles:

1. **Add new colors** in `src/constants/colors.ts`:

```tsx
export const Colors = {
  // ... existing colors
  newColor: '#FF5733',
};
```

2. **Use in components**:

```tsx
const styles = StyleSheet.create({
  newStyle: {
    backgroundColor: Colors.newColor,
  },
});
```

---

## 🚀 Next Steps for Growth

### When to Consider These Upgrades:

1. **State Management**: When prop drilling becomes unwieldy

   - Context API for shared state
   - Redux Toolkit for complex state logic
   - Zustand for simpler global state
2. **Form Management**: When forms get complex

   - React Hook Form
   - Formik + Yup validation
3. **Data Fetching**: When API calls become complex

   - React Query for server state
   - SWR for data fetching
4. **Testing**: When you want to prevent bugs

   - Jest for unit testing
   - React Native Testing Library
   - Detox for E2E testing
5. **Development Tools**: For better DX

   - Flipper for debugging
   - Reactotron for React Native debugging
   - TypeScript strict mode

### Code Organization Tips:

- Keep components small (under 200 lines)
- Extract reusable logic into custom hooks
- Use consistent naming conventions
- Group related functionality together
- Comment complex logic
- Use TypeScript strictly (avoid `any` types)

This guide should give you a solid foundation to understand and modify the frontend as it grows. The key is to start small and refactor as complexity increases!
