import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = PropsWithChildren<{
  title: string;
  /** Read out for the back button, e.g. "Back to More". */
  backLabel: string;
}>;

/** The deep-purple header of a screen pushed over the tabs, with a back button. */
export function ScreenHeader({ title, backLabel, children }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View className="bg-brand-purple-deep px-4 pb-5" style={{ paddingTop: insets.top + 8 }}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        className="-ml-2 size-11 items-center justify-center"
      >
        <Ionicons name="chevron-back" size={24} color="white" />
      </Pressable>
      <Text className="mt-1 font-display text-[28px] text-white leading-tight">{title}</Text>
      {children}
    </View>
  );
}
