import "@/global.css";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { Fraunces_500Medium } from "@expo-google-fonts/fraunces/500Medium";
import { Fraunces_500Medium_Italic } from "@expo-google-fonts/fraunces/500Medium_Italic";
import { PlusJakartaSans_400Regular } from "@expo-google-fonts/plus-jakarta-sans/400Regular";
import { PlusJakartaSans_500Medium } from "@expo-google-fonts/plus-jakarta-sans/500Medium";
import { PlusJakartaSans_600SemiBold } from "@expo-google-fonts/plus-jakarta-sans/600SemiBold";
import { PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans/700Bold";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { HeroUINativeProvider } from "heroui-native";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { Uniwind } from "uniwind";

import { authClient } from "@/lib/auth-client";

import { ENV } from "../src/env";

export const unstable_settings = {
  anchor: "(tabs)",
};

// Light theme only in v1, whatever the device setting.
Uniwind.setTheme("light");
SplashScreen.preventAutoHideAsync();

const convex = new ConvexReactClient(ENV.EXPO_PUBLIC_CONVEX_URL, {
  unsavedChangesWarning: false,
});

/** Signed-in Staff get the tabs; everyone else only the signed-out screens. */
function StackLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync();
  }, [isLoading]);

  if (isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="staff" />
        <Stack.Screen name="products/index" />
        <Stack.Screen name="products/edit" options={{ gestureEnabled: false }} />
        <Stack.Screen name="windows/index" />
        <Stack.Screen name="windows/product" />
        <Stack.Screen name="windows/new" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="windows/stage"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: [0.9],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen
          name="arrivals/record"
          options={{ presentation: "fullScreenModal", gestureEnabled: false }}
        />
        <Stack.Screen
          name="arrivals/late"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: [0.7],
            sheetGrabberVisible: true,
          }}
        />
        <Stack.Screen name="categories" />
        <Stack.Screen name="delivery-zones" />
        <Stack.Screen name="store-settings" />
        <Stack.Screen name="stock/index" />
        <Stack.Screen name="stock/variant" />
        <Stack.Screen name="orders/detail" />
        <Stack.Screen name="refunds" />
        {/* The Counter slides up over any tab as a full-screen desk. */}
        <Stack.Screen
          name="counter"
          options={{
            presentation: "fullScreenModal",
            animation: "slide_from_bottom",
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="forgot-password" />
        {/* Opened from email links, which land here through the app's URL scheme. */}
        <Stack.Screen name="accept-invite" />
        <Stack.Screen name="reset-password" />
      </Stack.Protected>
    </Stack>
  );
}

export default function Layout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_500Medium,
    Fraunces_500Medium_Italic,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  const ready = fontsLoaded || fontError !== null;

  if (!ready) return null;

  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <HeroUINativeProvider>
            <StatusBar style="light" />
            <StackLayout />
          </HeroUINativeProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ConvexBetterAuthProvider>
  );
}
