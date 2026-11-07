import { Chip } from "heroui-native";

const chips = {
  draft: { label: "DRAFT", color: "default" },
  published: { label: "PUBLISHED", color: "success" },
  archived: { label: "ARCHIVED", color: "danger" },
  needsPrices: { label: "NEEDS PRICES", color: "warning" },
} as const;

/** A Product's status pill, or the "needs prices" flag the Owner looks for. */
export function ProductStatusChip({ status }: { status: keyof typeof chips }) {
  const { label, color } = chips[status];
  return (
    <Chip size="sm" variant="soft" color={color}>
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  );
}
