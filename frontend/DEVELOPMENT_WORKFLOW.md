# Development Workflow Guide

This guide explains how to develop and debug the TBD frontend effectively, especially for someone new to React Native/TypeScript.

## 🚀 Daily Development Workflow

### 1. Starting Development
```bash
# Terminal 1: Start backend
cd backend
source venv/bin/activate
redis-server &  # Start Redis in background
python manage.py runserver

# Terminal 2: Start frontend
cd frontend
npm start
# Press 'i' for iOS simulator or scan QR code for device
```

### 2. Making Changes
1. **Edit files** in your IDE
2. **Save** → Expo auto-reloads
3. **Check simulator** for changes
4. **Test functionality**
5. **Commit when stable**

### 3. Common Development Tasks

#### Adding a New Feature
1. **Plan the feature**: What components/screens are needed?
2. **Add types**: Define data shapes in `types/index.ts`
3. **Create components**: Build UI components
4. **Add API calls**: If backend integration needed
5. **Test thoroughly**: Try edge cases and error scenarios
6. **Update documentation**: Add to this guide

#### Fixing a Bug
1. **Reproduce the bug**: Understand exactly what's happening
2. **Check console**: Look for error messages
3. **Add logging**: Use `console.log` to debug
4. **Fix the issue**: Make minimal changes
5. **Test the fix**: Ensure it works and doesn't break other things
6. **Remove debug logging**: Clean up console.log statements

## 🔍 Debugging Techniques

### 1. Console Logging
```tsx
// Debug state changes
useEffect(() => {
  console.log('Posts updated:', posts);
}, [posts]);

// Debug function calls
const handlePress = () => {
  console.log('Button pressed with data:', data);
  // ... function logic
};

// Debug renders
console.log('Component rendered with props:', props);
```

### 2. React Native Debugger
```bash
# Install React Native Debugger (one-time setup)
brew install --cask react-native-debugger

# Open debugger
open "rndebugger://set-debugger-loc?host=localhost&port=8081"
```

### 3. Network Debugging
```tsx
// Log API calls
api.interceptors.request.use(request => {
  console.log('Starting Request:', request.url);
  return request;
});

api.interceptors.response.use(
  response => {
    console.log('Response:', response.data);
    return response;
  },
  error => {
    console.log('API Error:', error.response?.data);
    return Promise.reject(error);
  }
);
```

### 4. Component State Debugging
```tsx
// Use React Developer Tools (browser)
// Or add debug info to UI temporarily
function DebugInfo({ data }) {
  if (__DEV__) {  // Only show in development
    return (
      <View style={{ position: 'absolute', top: 0, left: 0, backgroundColor: 'red' }}>
        <Text style={{ color: 'white', fontSize: 10 }}>
          {JSON.stringify(data, null, 2)}
        </Text>
      </View>
    );
  }
  return null;
}
```

## 🐛 Common Issues and Solutions

### 1. "Metro bundler issues"
```bash
# Clear cache and restart
npx expo start -c
# or
rm -rf node_modules && npm install
```

### 2. "Cannot read property of undefined"
```tsx
// Problem: Accessing nested property when object might be null
console.log(user.profile.name);  // Error if user is null

// Solution: Use optional chaining
console.log(user?.profile?.name);

// Or check explicitly
if (user && user.profile) {
  console.log(user.profile.name);
}
```

### 3. "Hooks can only be called inside function components"
```tsx
// Problem: Using hooks in wrong place
class MyComponent extends Component {
  const [state, setState] = useState();  // Error!
}

// Solution: Use function components
function MyComponent() {
  const [state, setState] = useState();  // Correct!
}
```

### 4. "Cannot update component while rendering"
```tsx
// Problem: Setting state during render
function MyComponent() {
  const [count, setCount] = useState(0);
  
  setCount(count + 1);  // Error: Infinite loop!
  
  return <View />;
}

// Solution: Use useEffect or event handlers
function MyComponent() {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    setCount(count + 1);  // Correct: In effect
  }, []);
  
  return (
    <TouchableOpacity onPress={() => setCount(count + 1)}>
      {/* Correct: In event handler */}
    </TouchableOpacity>
  );
}
```

### 5. "FlatList not scrolling"
```tsx
// Problem: FlatList parent doesn't have flex
<View style={{ height: 200 }}>  {/* Fixed height problem */}
  <FlatList data={items} ... />
</View>

// Solution: Use flex or proper height
<View style={{ flex: 1 }}>  {/* Takes available space */}
  <FlatList data={items} ... />
</View>
```

## ⚡ Performance Debugging

### 1. Slow Renders
```tsx
// Use React.memo for components that don't change often
export default React.memo(ExpensiveComponent);

// Use useCallback for functions passed as props
const handlePress = useCallback(() => {
  // Logic here
}, [dependencies]);

// Use useMemo for expensive calculations
const expensiveValue = useMemo(() => {
  return heavyCalculation(data);
}, [data]);
```

### 2. Memory Leaks
```tsx
// Problem: Not cleaning up subscriptions
useEffect(() => {
  const subscription = something.subscribe();
  // Missing cleanup!
}, []);

// Solution: Always return cleanup function
useEffect(() => {
  const subscription = something.subscribe();
  
  return () => {
    subscription.unsubscribe();  // Cleanup
  };
}, []);
```

### 3. Large Lists Performance
```tsx
// Use getItemLayout for better performance
const getItemLayout = (data, index) => ({
  length: ITEM_HEIGHT,
  offset: ITEM_HEIGHT * index,
  index,
});

<FlatList
  data={items}
  getItemLayout={getItemLayout}
  removeClippedSubviews={true}
  maxToRenderPerBatch={10}
  windowSize={10}
/>
```

## 🧪 Testing Your Changes

### 1. Manual Testing Checklist
- [ ] Component renders without errors
- [ ] All interactive elements work (buttons, inputs)
- [ ] Navigation works correctly
- [ ] API calls succeed and handle errors
- [ ] Loading states display properly
- [ ] Error states display properly
- [ ] Works on different screen sizes
- [ ] Pull-to-refresh works
- [ ] Infinite scroll works

### 2. Edge Case Testing
- [ ] What happens with empty data?
- [ ] What happens with very long text?
- [ ] What happens when API is slow/offline?
- [ ] What happens with invalid data?
- [ ] What happens when user taps rapidly?

### 3. Device Testing
- [ ] Test on iOS simulator
- [ ] Test on physical device
- [ ] Test with slow network
- [ ] Test with poor memory

## 📱 Device-Specific Issues

### iOS Simulator
- **Gestures**: Use Option+click for pinch gestures
- **Keyboard**: Hardware → Keyboard → Connect Hardware Keyboard
- **Deep links**: Use Device → Deep Link in simulator

### Physical Device Testing
```bash
# Connect via USB and use Expo Go app
npm start
# Scan QR code with camera app (iOS) or Expo Go (Android)
```

## 🔧 Development Tools Setup

### 1. VS Code Extensions (Recommended)
- **ES7+ React/Redux/React-Native snippets**: Code snippets
- **TypeScript Hero**: Auto import/organize imports
- **Prettier**: Code formatting
- **ESLint**: Code linting
- **React Native Tools**: Debugging support

### 2. Browser Tools
- **React Developer Tools**: Debug React components
- **Redux DevTools**: If you add Redux later

### 3. Flipper (Advanced Debugging)
```bash
# Install Flipper
brew install --cask flipper

# Add to package.json
npm install react-native-flipper --save-dev
```

## 🚦 Code Quality Guidelines

### 1. Naming Conventions
```tsx
// Components: PascalCase
function PostCard() {}

// Variables/functions: camelCase
const userName = 'test';
const handlePress = () => {};

// Constants: UPPER_SNAKE_CASE
const API_BASE_URL = 'http://localhost:8000';

// Files: match component name
PostCard.tsx
userService.ts
```

### 2. File Organization
```
src/
├── components/
│   ├── common/          # Shared components
│   ├── post/           # Post-related components
│   └── user/           # User-related components
├── screens/
├── services/
│   ├── api/            # API-related code
│   └── storage/        # Local storage code
├── utils/              # Helper functions
└── hooks/              # Custom hooks (when you learn them)
```

### 3. Import Organization
```tsx
// 1. React imports
import React, { useState, useEffect } from 'react';

// 2. React Native imports
import { View, Text, TouchableOpacity } from 'react-native';

// 3. Third-party imports
import { Ionicons } from '@expo/vector-icons';

// 4. Local imports (absolute paths)
import { Colors } from '../constants/colors';
import { Post } from '../types';
import PostCard from './PostCard';
```

## 📋 Code Review Checklist

Before committing code, check:
- [ ] No console.log statements left in code
- [ ] All TypeScript errors resolved
- [ ] Components have proper TypeScript types
- [ ] No obvious performance issues
- [ ] Error handling in place
- [ ] Code is properly formatted
- [ ] Unused imports removed
- [ ] Variable names are descriptive

## 🎯 Next Steps for Learning

### Immediate (Next 1-2 weeks)
1. **Practice modifying existing components**
2. **Add simple features** (new colors, fonts, etc.)
3. **Learn debugging techniques**
4. **Understand the data flow**

### Intermediate (Next 1-2 months)
1. **Custom hooks**: Extract reusable logic
2. **Context API**: Share state between components
3. **Form management**: React Hook Form
4. **Testing**: Basic unit tests

### Advanced (Next 3-6 months)
1. **Performance optimization**
2. **Complex state management** (Redux, Zustand)
3. **Animation libraries** (Lottie, Reanimated)
4. **Native modules**: Bridge to native code

Remember: Start small, make incremental changes, and test frequently. The React Native ecosystem is vast, but you can be productive with just the basics!

