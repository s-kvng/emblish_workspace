import { brand } from "@emblish_workspace/brand/tokens";
import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { Button } from "heroui-native";
import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";

import { PlaceholderScreen } from "@/components/placeholder-screen";
import { authClient } from "@/lib/auth-client";
import { useStaffMember } from "@/lib/staff-member";

const roleLabel = { owner: "Owner", staff: "Staff" } as const;

export default function More() {
  const staffMember = useStaffMember();

  return (
    <PlaceholderScreen title="More" description="Stock and Delivery Zones.">
      <MoreLink
        href="/stock"
        icon="cube"
        title="Stock"
        detail="Counts per Variant, Adjustments, Sold offline"
      />
      <MoreLink
        href="/products"
        icon="pricetags"
        title="Products"
        detail="Create, publish and archive Products; Categories"
      />
      {staffMember?.role === "owner" ? (
        <MoreLink
          href="/staff"
          icon="people"
          title="Staff"
          detail="Invite people, change roles, deactivate"
        />
      ) : null}
      <View className="rounded-2xl border border-border bg-surface p-4">
        <Text className="font-sans-semibold text-muted text-xs uppercase tracking-[2px]">
          Signed in as
        </Text>
        {staffMember ? (
          <>
            <Text className="mt-1.5 font-sans-semibold text-base text-foreground">
              {staffMember.name}
            </Text>
            <Text className="font-sans text-muted text-sm">
              {staffMember.email} · {roleLabel[staffMember.role]}
            </Text>
          </>
        ) : null}
        <Button variant="secondary" className="mt-4" onPress={() => authClient.signOut()}>
          <Button.Label>Sign out</Button.Label>
        </Button>
      </View>
    </PlaceholderScreen>
  );
}

function MoreLink({
  href,
  icon,
  title,
  detail,
}: {
  href: "/products" | "/staff" | "/stock";
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  detail: string;
}) {
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="button"
        className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-4"
      >
        <Ionicons name={icon} size={22} color={brand.purple} />
        <View className="flex-1">
          <Text className="font-sans-semibold text-base text-foreground">{title}</Text>
          <Text className="font-sans text-muted text-sm">{detail}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={brand["ink-muted"]} />
      </Pressable>
    </Link>
  );
}
