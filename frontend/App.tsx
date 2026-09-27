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
import { loadBootFeed } from './src/utils/bootFeed';
import PostComposerScreen from './src/screens/PostComposerScreen';
import PostDetailScreen from './src/screens/PostDetailScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createStackNavigator<RootStackParamList>();

// Updates must never restart the app while someone is looking at it: that
// showed the feed, then the loading screen, then a feed with a different
// masthead, and read as broken. So an update is fetched at launch and on
// every return to the foreground, and applied the moment the app goes to the
// background - a restart nobody sees. (A cold start also applies a fetched
// update on its own; the background restart covers iOS keeping the app warm
// for days, when no cold start comes.)
const useAutoUpdates = () => {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    let checking = false;
    let ready = false;
    const fetchIfAvailable = async () => {
      if (checking || ready) return;
      checking = true;
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          await Updates.fetchUpdateAsync();
          ready = true;
        }
      } catch {
        // offline or mid-publish; try again next foreground
      } finally {
        checking = false;
      }
    };

    fetchIfAvailable();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') fetchIfAvailable();
      else if (state === 'background' && ready) Updates.reloadAsync().catch(() => {});
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
    'CabinSketch': require('./assets/fonts/CabinSketch.ttf'),
    'CabinSketchBold': require('./assets/fonts/CabinSketchBold.ttf'),
    'Freeride': require('./assets/fonts/Freeride.otf'),
    'FrederickaTheGreat': require('./assets/fonts/FrederickaTheGreat.ttf'),
    'GrutchShaded': require('./assets/fonts/GrutchShaded.ttf'),
  });

  // The cached first feed page is read before the first render, alongside
  // the fonts, so the feed and its masthead paint once, already populated
  const [bootReady, setBootReady] = useState(false);
  useEffect(() => {
    loadBootFeed().finally(() => setBootReady(true));
  }, []);

  if (!fontsLoaded || !bootReady) {
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
        {/* The app-wide default. Mounted BEFORE the screens: React Native lets
            the last-mounted StatusBar win, so placed after the navigator this
            overrode every screen's own (feed masthead, detail, composer) */}
        <StatusBar style="dark" backgroundColor={Colors.background} />
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
        <Toast config={toastConfig} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
