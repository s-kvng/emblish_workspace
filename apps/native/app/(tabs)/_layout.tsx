import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { router, Tabs } from "expo-router";
import type { BottomTabBarButtonProps } from "expo-router/tabs";
import { type ComponentProps, useEffect } from "react";
import { type ColorValue, Pressable, Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import { useStaffMember } from "@/lib/staff-member";

/** The raised emblem-gold centre button: it opens the Counter over whichever tab is showing. */
function HandOverButton({ "aria-selected": selected }: BottomTabBarButtonProps) {
  const focused = selected ?? false;

  return (
    <Pressable
      onPress={() => router.push("/counter")}
      accessibilityRole="button"
      accessibilityLabel="Hand over: open the Counter"
      aria-selected={focused}
      className="flex-1 items-center"
    >
      <View
        className="-mt-6 size-14 items-center justify-center rounded-full bg-brand-gold"
        style={{ boxShadow: `0 4px 10px ${brand["purple-deep"]}40` }}
      >
        <Ionicons name="keypad" size={24} color={brand["purple-deep"]} />
      </View>
      <Text
        className="mt-1 font-sans-semibold text-[10px]"
        style={{ color: focused ? brand.purple : brand["ink-muted"] }}
      >
        Hand over
      </Text>
    </Pressable>
  );
}

function tabIcon(name: ComponentProps<typeof Ionicons>["name"]) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} size={size} color={color} />
  );
}

export default function TabLayout() {
  const staffMember = useStaffMember();

  // The Back Office is Staff-only: a session the server refuses is signed out.
  useEffect(() => {
    if (staffMember === null) void authClient.signOut();
  }, [staffMember]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand.purple,
        tabBarInactiveTintColor: brand["ink-muted"],
        tabBarLabelStyle: { fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 10 },
        tabBarStyle: { backgroundColor: brand.card, borderTopColor: brand.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarIcon: tabIcon("home"),
        }}
      />
      <Tabs.Screen
        name="arrivals"
        options={{
          title: "Arrivals",
          tabBarIcon: tabIcon("cube"),
        }}
      />
      <Tabs.Screen
        name="hand-over"
        options={{
          title: "Hand over",
          tabBarButton: (props) => <HandOverButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={{
          title: "Invoices",
          tabBarIcon: tabIcon("receipt"),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: tabIcon("menu"),
        }}
      />
    </Tabs>
  );
}
