// PROTOTYPE (wayfinder #15): floating variant switcher + Owner/Staff toggle. Dev only.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import type { Role } from "./bo-data";

export type VariantDef = { key: string; name: string; Component: React.ComponentType<{ role: Role }> };

export function usePrototypeParams(keys: string[]) {
  const params = useLocalSearchParams<{ variant?: string; role?: string }>();
  const variant = keys.includes(params.variant ?? "") ? params.variant! : keys[0];
  const role: Role = params.role === "staff" ? "staff" : "owner";
  return { variant, role };
}

export function VariantHost({ variants }: { variants: VariantDef[] }) {
  const keys = variants.map((v) => v.key);
  const { variant, role } = usePrototypeParams(keys);
  const current = variants.find((v) => v.key === variant)!;
  const C = current.Component;
  return (
    <View style={{ flex: 1, backgroundColor: "#f4f4f5" }}>
      {/* key remounts the variant so local form state resets when switching */}
      <C key={`${variant}-${role}`} role={role} />
      {__DEV__ && <PrototypeSwitcher variants={variants} current={variant} role={role} />}
    </View>
  );
}

function PrototypeSwitcher({ variants, current, role }: { variants: VariantDef[]; current: string; role: Role }) {
  const i = variants.findIndex((v) => v.key === current);
  const go = (d: number) => router.setParams({ variant: variants[(i + d + variants.length) % variants.length].key });

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, top: 6, alignItems: "center", zIndex: 1000 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#111827",
          borderRadius: 999,
          paddingHorizontal: 6,
          paddingVertical: 4,
          gap: 4,
          shadowColor: "#000",
          shadowOpacity: 0.3,
          shadowRadius: 8,
          borderWidth: 2,
          borderColor: "#facc15",
        }}
      >
        <Pressable onPress={() => go(-1)} style={{ paddingHorizontal: 8 }}>
          <Text style={{ color: "#fff", fontSize: 14 }}>◀</Text>
        </Pressable>
        <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
          {current} · {variants[i].name}
        </Text>
        <Pressable onPress={() => go(1)} style={{ paddingHorizontal: 8 }}>
          <Text style={{ color: "#fff", fontSize: 14 }}>▶</Text>
        </Pressable>
        <Pressable
          onPress={() => router.setParams({ role: role === "owner" ? "staff" : "owner" })}
          style={{ backgroundColor: role === "owner" ? "#facc15" : "#38bdf8", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}
        >
          <Text style={{ color: "#111827", fontSize: 10, fontWeight: "800" }}>{role === "owner" ? "OWNER" : "STAFF"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
