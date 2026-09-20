import React, { useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useFonts } from 'expo-font';

import { Colors } from './src/constants/colors';
import { RootStackParamList, Post } from './src/types';
import MainScreen from './src/screens/MainScreen';
import PostComposerScreen from './src/screens/PostComposerScreen';
import PostDetailScreen from './src/screens/PostDetailScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
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
              presentation: 'modal',
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
        <Toast />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
