import type { MutationCtx, QueryCtx } from "../_generated/server";
import { openOrderStatuses } from "../schema";

/** No 0/O, 1/I/L: easy to read aloud and type from a phone. */
const unambiguous = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomFrom(alphabet: string, length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

/** A Receipt's 8-character public code, regenerated on collision. */
export async function newReceiptCode(ctx: Pick<QueryCtx, "db">) {
  for (;;) {
    const code = randomFrom(unambiguous, 8);
    const taken = await ctx.db
      .query("payments")
      .withIndex("by_receiptCode", (q) => q.eq("receiptCode", code))
      .first();
    if (!taken) return code;
  }
}

/** An invoice's 8-character public `/p/` code, regenerated on collision. */
export async function newInvoiceCode(ctx: Pick<QueryCtx, "db">) {
  for (;;) {
    const code = randomFrom(unambiguous, 8);
    const taken = await ctx.db
      .query("invoices")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!taken) return code;
  }
}

/** 6 random digits, unique among open orders; a code may repeat once its order closes. */
export async function newPickupCode(ctx: Pick<QueryCtx, "db">) {
  for (;;) {
    const code = randomFrom("0123456789", 6);
    if (!(await pickupCodeTaken(ctx, code))) return code;
  }
}

async function pickupCodeTaken(ctx: Pick<QueryCtx, "db">, code: string) {
  for (const status of openOrderStatuses) {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_pickupCode_and_status", (q) => q.eq("pickupCode", code).eq("status", status))
      .first();
    if (order) return true;
  }
  return false;
}

/** The next reference in a sequence, e.g. `S-0001`, bumping its counter in this mutation. */
export async function nextReference(
  ctx: Pick<MutationCtx, "db">,
  name: "S" | "P" | "R" | "INV",
) {
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  const number = counter?.next ?? 1;
  if (counter) await ctx.db.patch(counter._id, { next: number + 1 });
  else await ctx.db.insert("counters", { name, next: number + 1 });
  return `${name}-${String(number).padStart(4, "0")}`;
}
