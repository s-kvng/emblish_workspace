import { Button } from "heroui-native";
import { Text, View } from "react-native";

import { PlaceholderScreen } from "@/components/placeholder-screen";
import { authClient } from "@/lib/auth-client";
import { useStaffMember } from "@/lib/staff-member";

const roleLabel = { owner: "Owner", staff: "Staff" } as const;

export default function More() {
  const staffMember = useStaffMember();

  return (
    <PlaceholderScreen title="More" description="Stock, Delivery Zones and Staff.">
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
