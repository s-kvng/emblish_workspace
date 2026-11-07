import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Link } from "expo-router";
import { Button, Spinner } from "heroui-native";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductStatusChip } from "@/components/product-status-chip";
import { ScreenHeader } from "@/components/screen-header";

type ProductRow = FunctionReturnType<typeof api.backOffice.products.list>[number];

/** More → Products: start a new Product, or pick one to edit. */
export default function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const products = useQuery(api.backOffice.products.list);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="grow">
      <ScreenHeader title="Products" backLabel="Back to More" />
      <View className="gap-4 p-4" style={{ paddingBottom: insets.bottom + 16 }}>
        <Link href="/products/edit" asChild>
          <Button size="lg" className="h-16">
            <Ionicons name="add" size={24} color="white" />
            <Button.Label>New product</Button.Label>
          </Button>
        </Link>
        <Link href="/categories" asChild>
          <Button variant="secondary">
            <Button.Label>Categories</Button.Label>
          </Button>
        </Link>
        {products === undefined ? (
          <Spinner />
        ) : products.length > 0 ? (
          <View className="gap-3">
            <Text className="font-sans-semibold text-muted text-xs uppercase tracking-[2px]">
              Or edit an existing one
            </Text>
            {products.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function ProductCard({ product }: { product: ProductRow }) {
  return (
    <Link href={{ pathname: "/products/edit", params: { id: product._id } }} asChild>
      <Pressable
        accessibilityRole="button"
        className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-3"
      >
        {product.coverUrl ? (
          <Image
            source={{ uri: product.coverUrl }}
            className="size-14 rounded-xl"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View className="size-14 items-center justify-center rounded-xl bg-brand-muted">
            <Ionicons name="image-outline" size={22} color={brand["ink-muted"]} />
          </View>
        )}
        <View className="flex-1">
          <Text className="font-sans-semibold text-base text-foreground">{product.name}</Text>
          <Text className="font-sans text-muted text-xs">
            {product.categoryName ?? "No Category"} · {product.variantCount} Variant
            {product.variantCount === 1 ? "" : "s"}
          </Text>
          <View className="mt-1.5 flex-row gap-1.5">
            <ProductStatusChip status={product.status} />
            {product.needsPrices && product.status !== "archived" ? (
              <ProductStatusChip status="needsPrices" />
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={brand["ink-muted"]} />
      </Pressable>
    </Link>
  );
}
