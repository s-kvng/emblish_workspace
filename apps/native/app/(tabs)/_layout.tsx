import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { BottomTabBarButtonProps } from "expo-router/tabs";
import type { ComponentProps } from "react";
import { type ColorValue, Pressable, Text, View } from "react-native";

/** The raised emblem-gold centre button that opens handover from any tab. */
function HandOverButton({ onPress, "aria-selected": selected }: BottomTabBarButtonProps) {
  const focused = selected ?? false;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel="Hand over"
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
