import React, { useState, useEffect } from 'react';
import * as Updates from 'expo-updates';
import { AppState } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast, { ToastConfig } from 'react-native-toast-message';
import { View, Text } from 'react-native';

// House-style toasts: hard rectangles, hairline border, Courier - no more
// default rounded iOS pills
const toastBase = (bg: string, ink: string) =>
  ({ text1, text2 }: any) => (
    <View style={{
      minWidth: '70%', maxWidth: '92%', backgroundColor: bg,
      borderWidth: 1, borderColor: '#88888A', paddingHorizontal: 16, paddingVertical: 10,
    }}>
      <Text style={{ color: ink, fontFamily: 'CourierPrime', fontWeight: '700', fontSize: 14 }}>{text1}</Text>
      {text2 ? <Text style={{ color: ink, fontFamily: 'CourierPrime', fontSize: 12, opacity: 0.85 }}>{text2}</Text> : null}
    </View>
  );

const toastConfig: ToastConfig = {
  success: toastBase(Colors.surface, Colors.background),
  info: toastBase(Colors.background, Colors.primary),
  error: toastBase(Colors.accent, '#FFFFFF'),
};
import { useFonts } from 'expo-font';

import { Colors } from './src/constants/colors';
import { RootStackParamList, Post } from './src/types';
import MainScreen from './src/screens/MainScreen';
import PostComposerScreen from './src/screens/PostComposerScreen';
import PostDetailScreen from './src/screens/PostDetailScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createStackNavigator<RootStackParamList>();

// expo-updates downloads in the background and applies on the NEXT launch -
// but iOS keeps a backgrounded app warm, so reopening it is not a launch and
// the update can sit unapplied for days. Fetch and reload on our own terms
// instead: at startup, and whenever the app returns to the foreground.
const useAutoUpdates = () => {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    let applying = false;
    const sync = async () => {
      if (applying) return;
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        applying = true;
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } catch {
        applying = false; // offline or mid-publish; try again next foreground
      }
    };

    sync();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') sync();
    });
    return () => sub.remove();
  }, []);
};

export default function App() {
  useAutoUpdates();
  // The exact same font files the backend renders with (see the model's
  // FONT_PATH_CANDIDATES), so the composer preview matches the server render
  const [fontsLoaded] = useFonts({
    'ArialBlack': require('./assets/fonts/ArialBlack.ttf'),
    'Impact': require('./assets/fonts/Impact.ttf'),
    'TimesNewRoman': require('./assets/fonts/TimesNewRoman.ttf'),
    'CourierPrime': require('./assets/fonts/CourierPrime.ttf'),
    'Caveat': require('./assets/fonts/Caveat.ttf'),
    'Papyrus': require('./assets/fonts/Papyrus.ttf'),
    'CourierPrimeBold': require('./assets/fonts/CourierPrimeBold.ttf'),
    'CourierPrimeItalic': require('./assets/fonts/CourierPrimeItalic.ttf'),
    'CourierPrimeBoldItalic': require('./assets/fonts/CourierPrimeBoldItalic.ttf'),
    'TimesNewRomanBold': require('./assets/fonts/TimesNewRomanBold.ttf'),
    'TimesNewRomanItalic': require('./assets/fonts/TimesNewRomanItalic.ttf'),
    'TimesNewRomanBoldItalic': require('./assets/fonts/TimesNewRomanBoldItalic.ttf'),
    'CaveatBold': require('./assets/fonts/CaveatBold.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={{
        dark: false,
        fonts: DefaultTheme.fonts,
        colors: {
          primary: Colors.accent,
          background: Colors.background,
          card: Colors.background,
          text: Colors.primary,
          border: Colors.border,
          notification: Colors.accent,
        },
      }}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            cardStyle: { backgroundColor: Colors.background },
          }}
        >
          <Stack.Screen 
            name="Main" 
            component={MainScreen}
          />
          <Stack.Screen 
            name="PostComposer" 
            component={PostComposerScreen}
            options={{
              headerShown: false,
              animationTypeForReplace: 'push',
              cardStyle: { backgroundColor: Colors.background },
            }}
          />
          <Stack.Screen
            name="PostDetail"
            component={PostDetailScreen}
            options={{
              headerShown: false,
              // a card push, not a modal: the detail slides in from the right
              // and covers the screen edge to edge, no sheet inset on top
              presentation: 'card',
              gestureEnabled: true,
              cardStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{
              headerShown: false,
              presentation: 'modal',
            }}
          />
          <Stack.Screen 
            name="Settings" 
            component={SettingsScreen}
            options={{
              headerShown: false,
              presentation: 'modal',
            }}
          />
        </Stack.Navigator>
        <StatusBar style="dark" backgroundColor={Colors.background} />
        <Toast config={toastConfig} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
