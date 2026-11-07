import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Link } from "expo-router";
import { Spinner } from "heroui-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductStatusChip } from "@/components/product-status-chip";
import { variantLabel } from "@/components/product-wizard/draft";
import { ScreenHeader } from "@/components/screen-header";

type StockRow = FunctionReturnType<typeof api.backOffice.stock.list>[number];

/** More → Stock: every Product's Variants with live counts; a Variant opens its ledger. */
export default function StockScreen() {
  const insets = useSafeAreaInsets();
  const products = useQuery(api.backOffice.stock.list);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="grow">
      <ScreenHeader title="Stock" backLabel="Back to More" />
      <View className="gap-4 p-4" style={{ paddingBottom: insets.bottom + 16 }}>
        {products === undefined ? (
          <Spinner />
        ) : products.length === 0 ? (
          <Text className="font-sans text-muted text-sm">
            No Products yet. Add one under More → Products, then record its Stock here.
          </Text>
        ) : (
          products.map((product) => <ProductStock key={product._id} product={product} />)
        )}
      </View>
    </ScrollView>
  );
}

function ProductStock({ product }: { product: StockRow }) {
  return (
    <View className="rounded-2xl border border-border bg-surface">
      <View className="flex-row items-center gap-2 px-4 pt-4 pb-2">
        <Text className="flex-1 font-sans-semibold text-base text-foreground" numberOfLines={1}>
          {product.name}
        </Text>
        {product.status === "published" ? null : <ProductStatusChip status={product.status} />}
      </View>
      <View className="flex-row px-4 pb-1">
        <Text className="flex-1 font-sans-semibold text-[11px] text-muted uppercase tracking-[1px]">
          Variant
        </Text>
        {["On hand", "Held", "Avail."].map((heading) => (
          <Text
            key={heading}
            className="w-14 text-right font-sans-semibold text-[11px] text-muted uppercase tracking-[1px]"
          >
            {heading}
          </Text>
        ))}
        <View className="w-6" />
      </View>
      {product.variants.map((variant) => (
        <Link
          key={variant._id}
          href={{ pathname: "/stock/variant", params: { id: variant._id } }}
          asChild
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${variantLabel(variant)}: ${variant.onHand} on hand, ${variant.held} held, ${variant.available} available`}
            className="min-h-12 flex-row items-center border-border border-t px-4 py-2"
          >
            <View className="flex-1">
              <Text className="font-sans-medium text-foreground">{variantLabel(variant)}</Text>
              {variant.sku ? (
                <Text className="font-sans text-muted text-xs">{variant.sku}</Text>
              ) : null}
            </View>
            <Text className="w-14 text-right font-sans-semibold text-foreground">
              {variant.onHand}
            </Text>
            <Text className="w-14 text-right font-sans text-muted">{variant.held}</Text>
            <Text
              className={`w-14 text-right font-sans-bold ${variant.available > 0 ? "text-success" : variant.available < 0 ? "text-danger" : "text-muted"}`}
            >
              {variant.available}
            </Text>
            <View className="w-6 items-end">
              <Ionicons name="chevron-forward" size={18} color={brand["ink-muted"]} />
            </View>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}
