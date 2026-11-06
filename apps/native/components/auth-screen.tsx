import type { PropsWithChildren } from "react";
import { Image, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const emblem = require("@/assets/images/emblem.png");

/** The signed-out Back Office screens: sign in, accept an invitation, reset a password. */
export function AuthScreen({ title, children }: PropsWithChildren<{ title: string }>) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerClassName="grow"
      keyboardShouldPersistTaps="handled"
    >
      <View className="bg-brand-purple-deep px-4 pb-8" style={{ paddingTop: insets.top + 32 }}>
        <Image source={emblem} className="size-10" accessibilityIgnoresInvertColors />
        <Text className="mt-4 font-sans-semibold text-brand-gold-bright text-xs uppercase tracking-[2px]">
          Back Office
        </Text>
        <Text className="mt-1 font-display text-[32px] text-white leading-tight">{title}</Text>
      </View>
      <View className="gap-4 p-4" style={{ paddingBottom: insets.bottom + 16 }}>
        {children}
      </View>
    </KeyboardAwareScrollView>
  );
}
