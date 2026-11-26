import Constants from 'expo-constants';
import React, { useState, useEffect } from 'react';
import * as Updates from 'expo-updates';
import * as LegacyFS from 'expo-file-system/legacy';
import { AppState } from 'react-native';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
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
import { loadDrafts } from './src/utils/drafts';
import PostComposerScreen from './src/screens/PostComposerScreen';
import PostDetailScreen from './src/screens/PostDetailScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ArchiveScreen from './src/screens/ArchiveScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { registerForPush, onNotificationOpened } from './src/services/push';

const Stack = createStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

// A tapped notification opens the post it is about. One that launched the
// app arrives before the navigator exists, so it waits for onReady.
let postToOpen: string | null = null;
const openPost = (postId: string) => {
  if (navigationRef.isReady()) navigationRef.navigate('PostDetail', { postId });
  else postToOpen = postId;
};
const openWaitingPost = () => {
  if (postToOpen) openPost(postToOpen);
  postToOpen = null;
};

// Updates must never restart the app while someone is looking at it: that
// showed the feed, then the loading screen, then a feed with a different
// masthead, and read as broken. So there are two moments an update lands:
//
// 1. A cold launch. Before the first screen is drawn the app asks for an
//    update and, if one arrives within LAUNCH_UPDATE_WAIT_MS, restarts into
//    it - one launch shows the newest version. Past the wait the app opens
//    as it is and the download carries on behind it.
// 2. Going to the background, for an update fetched while the app was open
//    (at launch past the wait, or on a return to the foreground) - a restart
//    nobody sees. iOS keeps the app warm for days; no cold start comes.
const LAUNCH_UPDATE_WAIT_MS = 3000;
// A launch restart is not repeated within this long: an update that fails to
// start is rolled back by the system, and would otherwise be fetched and
// restarted into again, for ever
const LAUNCH_RESTART_GUARD_MS = 2 * 60 * 1000;
const LAUNCH_RESTART_FILE = LegacyFS.documentDirectory + 'launch-update-restart';

const updatesOn = !__DEV__ && Updates.isEnabled;
let updateChecking = false;
let updateReady = false;
const fetchUpdateIfAvailable = async () => {
  if (updateChecking || updateReady) return;
  updateChecking = true;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) {
      await Updates.fetchUpdateAsync();
      updateReady = true;
    }
  } catch {
    // offline or mid-publish; try again next foreground
  } finally {
    updateChecking = false;
  }
};

const restartedJustNow = async () => {
  try {
    const at = Number(await LegacyFS.readAsStringAsync(LAUNCH_RESTART_FILE));
    return Date.now() - at < LAUNCH_RESTART_GUARD_MS;
  } catch {
    return false;
  }
};

// Resolves when the app may draw its first screen. If an update arrives in
// time it restarts instead and the promise is left behind with the old code.
const settleLaunchUpdate = (): Promise<void> => {
  if (!updatesOn || Updates.isEmergencyLaunch) return Promise.resolve();
  let waiting = true;
  const wait = new Promise<void>(resolve => setTimeout(() => { waiting = false; resolve(); }, LAUNCH_UPDATE_WAIT_MS));
  const apply = (async () => {
    await fetchUpdateIfAvailable();
    if (!updateReady || !waiting || (await restartedJustNow())) return;
    await LegacyFS.writeAsStringAsync(LAUNCH_RESTART_FILE, String(Date.now())).catch(() => {});
    await Updates.reloadAsync();
  })().catch(() => {});
  return Promise.race([wait, apply]);
};

const useAutoUpdates = () => {
  useEffect(() => {
    if (!updatesOn) return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') fetchUpdateIfAvailable();
      else if (state === 'background' && updateReady) Updates.reloadAsync().catch(() => {});
    });
    return () => sub.remove();
  }, []);
};

// Development only: Expo Go links straight to a post, so tools can open
// any post page (the parity check: tools/parity_check.py)
//   exp://<host>/--/post/<id>?textMode=plan
const devHost = Constants.expoConfig?.hostUri;
const DEV_LINKING = __DEV__ && devHost
  ? { prefixes: [`exp://${devHost}/--/`], config: { screens: { PostDetail: 'post/:postId', Archive: 'archive' } } }
  : undefined;

export default function App() {
  useAutoUpdates();
  useEffect(() => {
    // the token can change between launches; never prompts from here
    registerForPush();
    return onNotificationOpened(openPost);
  }, []);
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
    'PetitFormalScript': require('./assets/fonts/PetitFormalScript.ttf'),
    'LexendExaLight': require('./assets/fonts/LexendExaLight.ttf'),
    'LexendExaSemiBold': require('./assets/fonts/LexendExaSemiBold.ttf'),
    'GrutchShaded': require('./assets/fonts/GrutchShaded.ttf'),
    'Cavalhatriz': require('./assets/fonts/Cavalhatriz.ttf'),
    'PrincessSofia': require('./assets/fonts/PrincessSofia.ttf'),
    'PinyonScript': require('./assets/fonts/PinyonScript.ttf'),
    'Monocraft': require('./assets/fonts/Monocraft.ttf'),
    'MonocraftBold': require('./assets/fonts/MonocraftBold.ttf'),
  });

  // The cached first feed page is read before the first render, alongside
  // the fonts, so the feed and its masthead paint once, already populated.
  // Drafts too: the composer opens straight onto an unfinished canvas.
  const [bootReady, setBootReady] = useState(false);
  useEffect(() => {
    Promise.all([loadBootFeed(), loadDrafts(), settleLaunchUpdate()]).finally(() => setBootReady(true));
  }, []);

  if (!fontsLoaded || !bootReady) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef} onReady={openWaitingPost} linking={DEV_LINKING} theme={{
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
            name="Archive"
            component={ArchiveScreen}
            options={{ headerShown: false, presentation: 'card', gestureEnabled: true }}
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
