import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { Colors } from './src/constants/colors';
import { RootStackParamList, Post } from './src/types';
import MainScreen from './src/screens/MainScreen';
import PostComposerScreen from './src/screens/PostComposerScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={{
        dark: false,
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
              presentation: 'fullScreenModal',
              animationTypeForReplace: 'push',
              cardStyle: { backgroundColor: Colors.background },
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
