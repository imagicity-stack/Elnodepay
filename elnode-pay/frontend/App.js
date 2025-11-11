import React, { useCallback } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { StatusBar } from 'expo-status-bar';

import SplashScreenView from './screens/SplashScreen';
import RoleSelectScreen from './screens/RoleSelectScreen';
import LoginScreen from './screens/LoginScreen';
import ParentDashboard from './screens/ParentDashboard';
import AccountantDashboard from './screens/AccountantDashboard';

SplashScreen.preventAutoHideAsync();

const Stack = createNativeStackNavigator();

const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#FFFFFF'
  }
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_700Bold
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <NavigationContainer theme={AppTheme} onReady={onLayoutRootView}>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerStyle: { backgroundColor: '#A31F36' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontFamily: 'Poppins_500Medium' }
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreenView} options={{ headerShown: false }} />
        <Stack.Screen name="RoleSelect" component={RoleSelectScreen} options={{ title: 'Select Role' }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Login' }} />
        <Stack.Screen name="ParentDashboard" component={ParentDashboard} options={{ title: 'Parent Dashboard' }} />
        <Stack.Screen name="AccountantDashboard" component={AccountantDashboard} options={{ title: 'Accountant Dashboard' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
