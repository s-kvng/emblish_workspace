import { Image, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const emblem = require("@/assets/images/emblem.png");

type Props = {
  title: string;
  /** One plain sentence on what this tab will hold. */
  description: string;
};

/** A Back Office tab that isn't built yet: the deep-purple header and a note. */
export function PlaceholderScreen({ title, description }: Props) {
  const insets = useSafeAreaInsets();

  return (
    // The tab bar already clears the bottom inset, so no Container here.
    <ScrollView className="flex-1 bg-background" contentContainerClassName="grow">
      <View className="bg-brand-purple-deep px-4 pb-5" style={{ paddingTop: insets.top + 16 }}>
        <Image source={emblem} className="size-7" accessibilityIgnoresInvertColors />
        <Text className="mt-3 font-display text-[28px] text-white leading-tight">{title}</Text>
      </View>
      <View className="p-4">
        <View className="rounded-2xl border border-border bg-surface p-4">
          <Text className="font-sans-semibold text-brand-gold-ink text-xs uppercase tracking-[2px]">
            Coming soon
          </Text>
          <Text className="mt-1.5 font-sans text-muted text-sm">{description}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
