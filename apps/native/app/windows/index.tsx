import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { Link } from "expo-router";
import { Button, Spinner } from "heroui-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/screen-header";
import { windowSummary } from "@/components/window-labels";

/** More → Order Windows: open a new one, or see a Product's windows. */
export default function WindowsScreen() {
  const insets = useSafeAreaInsets();
  const products = useQuery(api.backOffice.products.list);
  const live = products?.filter((product) => product.status !== "archived");
  const withWindow = live?.filter((product) => product.window);
  const without = live?.filter((product) => !product.window);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="grow">
      <ScreenHeader title="Order Windows" backLabel="Back to More" />
      <View className="gap-4 p-4" style={{ paddingBottom: insets.bottom + 16 }}>
        <Link href="/windows/new" asChild>
          <Button size="lg" className="h-16">
            <Ionicons name="add" size={24} color="white" />
            <Button.Label>Open a window</Button.Label>
          </Button>
        </Link>
        {live === undefined ? (
          <Spinner />
        ) : (
          <>
            {withWindow && withWindow.length > 0 ? (
              <Section title="Open and draft">
                {withWindow.map((product) => (
                  <ProductRow
                    key={product._id}
                    productId={product._id}
                    name={product.name}
                    detail={product.window ? windowSummary(product.window) : ""}
                    highlight
                  />
                ))}
              </Section>
            ) : null}
            {without && without.length > 0 ? (
              <Section title="No window now">
                {without.map((product) => (
                  <ProductRow
                    key={product._id}
                    productId={product._id}
                    name={product.name}
                    detail={product.categoryName ?? "No Category"}
                  />
                ))}
              </Section>
            ) : null}
          </>
        )}
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="font-sans-semibold text-muted text-xs uppercase tracking-[2px]">
        {title}
      </Text>
      {children}
    </View>
  );
}

function ProductRow({
  productId,
  name,
  detail,
  highlight = false,
}: {
  productId: string;
  name: string;
  detail: string;
  highlight?: boolean;
}) {
  return (
    <Link href={{ pathname: "/windows/product", params: { productId } }} asChild>
      <Pressable
        accessibilityRole="button"
        className="flex-row items-center rounded-2xl border border-border bg-surface p-4"
      >
        <View className="flex-1">
          <Text className="font-sans-semibold text-base text-foreground">{name}</Text>
          <Text className={`font-sans text-xs ${highlight ? "text-brand-gold" : "text-muted"}`}>
            {detail}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={brand["ink-muted"]} />
      </Pressable>
    </Link>
  );
}
