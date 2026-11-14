import { ConvexError, type Infer, v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { fulfilment, fulfilmentRequest } from "../schema";
import { toGhanaPhone } from "./customers";

export type Fulfilment = Infer<typeof fulfilment>;
export type FulfilmentRequest = Infer<typeof fulfilmentRequest>;

function refuse(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

/**
 * The fulfilment to freeze on a Checkout: Pickup as it is, or Delivery to an active zone
 * at its fee now, with the address checked. The recipient defaults to the Customer.
 */
export async function freezeFulfilment(
  ctx: Pick<QueryCtx, "db">,
  customer: Pick<Doc<"customers">, "name" | "phone">,
  request: FulfilmentRequest,
): Promise<Fulfilment> {
  if (request.method === "pickup") return { method: "pickup" };

  const zone = await ctx.db.get(request.zoneId);
  if (!zone?.active) {
    refuse("ZONE_UNAVAILABLE", "We no longer deliver to that zone. Pick another one.");
  }
  const area = request.area.trim();
  const landmark = request.landmark.trim();
  if (!area || !landmark) {
    refuse(
      "ADDRESS_REQUIRED",
      "Tell us the area and the closest landmark, so the rider finds you.",
    );
  }
  const recipientName = request.recipientName?.trim() || customer.name;
  if (!recipientName) refuse("NAME_REQUIRED", "Who should the rider ask for?");
  const recipientPhone = request.recipientPhone?.trim()
    ? toGhanaPhone(request.recipientPhone)
    : customer.phone;
  if (!recipientPhone) {
    refuse("INVALID_PHONE", "Enter the recipient's Ghana number, like 024 123 4567.");
  }
  const street = request.street?.trim();
  const ghanaPostGps = request.ghanaPostGps?.trim().toUpperCase();
  return {
    method: "delivery",
    zoneId: zone._id,
    zoneName: zone.name,
    ...(zone.fee === undefined ? {} : { deliveryFee: zone.fee }),
    recipientName,
    recipientPhone,
    area,
    ...(street ? { street } : {}),
    landmark,
    ...(ghanaPostGps ? { ghanaPostGps } : {}),
  };
}

/** The Delivery Fee one order pays at Checkout: nothing for Pickup or an Elsewhere quote. */
export function deliveryFeeToday(fulfilment: Fulfilment) {
  return fulfilment.method === "delivery" ? (fulfilment.deliveryFee ?? 0) : 0;
}

/** Whether the Delivery Fee is still to be quoted by Staff (Elsewhere in Ghana). */
export function awaitsDeliveryQuote(fulfilment: Fulfilment) {
  return (
    fulfilment.method === "delivery" &&
    fulfilment.deliveryFee === undefined &&
    fulfilment.quotedFee === undefined
  );
}

/** The Delivery Fee an invoice bills: one quoted for Elsewhere, else the zone's frozen fee. */
export function invoicedDeliveryFee(fulfilment: Fulfilment) {
  return fulfilment.method === "delivery"
    ? (fulfilment.quotedFee ?? fulfilment.deliveryFee ?? 0)
    : 0;
}

/** A Delivery as Customers and Staff read it: everything frozen at Checkout but the zone's id. */
export const shownDelivery = v.object({
  method: v.literal("delivery"),
  zoneName: v.string(),
  /** Integer pesewas, paid at Checkout; missing while an Elsewhere fee awaits its quote. */
  deliveryFee: v.optional(v.number()),
  /** Integer pesewas Staff quoted for Elsewhere in Ghana, billed on an invoice. */
  quotedFee: v.optional(v.number()),
  recipientName: v.string(),
  recipientPhone: v.string(),
  area: v.string(),
  street: v.optional(v.string()),
  landmark: v.string(),
  ghanaPostGps: v.optional(v.string()),
});

/** An order's fulfilment as a Receipt or the Back Office order detail shows it. */
export const shownFulfilment = v.union(v.object({ method: v.literal("pickup") }), shownDelivery);

type DeliveryFulfilment = Extract<Fulfilment, { method: "delivery" }>;

/** A Delivery as the Customer reads it: everything but the zone's id. */
export function deliveryAsShown({ zoneId: _zoneId, ...shown }: DeliveryFulfilment) {
  return shown;
}

/** An order's fulfilment as a Receipt or the Back Office order detail shows it. */
export function fulfilmentAsShown(f: Fulfilment): Infer<typeof shownFulfilment> {
  return f.method === "pickup" ? f : deliveryAsShown(f);
}
