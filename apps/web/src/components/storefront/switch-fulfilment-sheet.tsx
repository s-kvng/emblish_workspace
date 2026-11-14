"use client";

import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { Button } from "@emblish_workspace/ui/components/button";
import { Input } from "@emblish_workspace/ui/components/input";
import { Label } from "@emblish_workspace/ui/components/label";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { messageOf } from "@/lib/convex-errors";
import { cedi } from "@/lib/money";

type Card = FunctionReturnType<typeof api.storefront.orders.mine>[number];
type Choice = FunctionReturnType<typeof api.storefront.orders.switchOptions>["choices"][number];
type Effect = Choice["effects"][number];

/** One money effect, in the Customer's words (Storefront prototype: My orders). */
function effectText(effect: Effect) {
  switch (effect.kind) {
    case "onComingInvoice":
      return `Delivery Fee ${cedi(effect.amount)}, added to your Shipping Fee Invoice when we send it.`;
    case "invoiceReissued":
      return `We'll send a new invoice for ${cedi(effect.total)} in place of ${effect.number}. The due date stays.`;
    case "invoiceVoided":
      return `${effect.number} (${cedi(effect.amount)}) is cancelled. Nothing to pay on it.`;
    case "newInvoice":
      return `Delivery Fee to pay: ${cedi(effect.amount)}. We'll text you the link.`;
    case "refund":
      return `${cedi(effect.amount)} back to you, refund pending.`;
    case "refundCancelled":
      return `The ${cedi(effect.amount)} refund from your last change goes towards delivery instead.`;
    case "quoteLater":
      return "We'll text you a quote for delivery there.";
  }
}

/** "+GH₵ 20", "−GH₵ 30", or nothing when the fee doesn't change or awaits a quote. */
function differenceText(difference: number | undefined) {
  if (difference === undefined || difference === 0) return undefined;
  return `${difference > 0 ? "+" : "−"}${cedi(Math.abs(difference))}`;
}

type Address = {
  recipientName: string;
  recipientPhone: string;
  area: string;
  street: string;
  landmark: string;
  ghanaPostGps: string;
};

function addressOf(card: Card): Address {
  const f = card.fulfilment;
  return f.method === "delivery"
    ? {
        recipientName: f.recipientName,
        recipientPhone: f.recipientPhone,
        area: f.area,
        street: f.street ?? "",
        landmark: f.landmark,
        ghanaPostGps: f.ghanaPostGps ?? "",
      }
    : {
        recipientName: "",
        recipientPhone: "",
        area: "",
        street: "",
        landmark: "",
        ghanaPostGps: "",
      };
}

/** A choice's key: "pickup", or the zone's id. */
function keyOf(choice: Choice) {
  return choice.method === "pickup" ? "pickup" : choice.zoneId;
}

/**
 * "Change pickup or delivery" on a My orders card, until dispatch: a bottom sheet with Pickup and
 * every zone (its fee and the difference), the address for Delivery, and a live money-effect panel
 * pinned above Confirm. What the panel says is what the server applies.
 */
export default function SwitchFulfilment({ card }: { card: Card }) {
  const [open, setOpen] = useState(false);
  if (!card.canSwitch) return null;
  return (
    <>
      <Button variant="outline" className="h-11 w-full text-sm" onClick={() => setOpen(true)}>
        Change pickup or delivery
      </Button>
      {open && <Sheet card={card} onClose={() => setOpen(false)} />}
    </>
  );
}

function Sheet({ card, onClose }: { card: Card; onClose: () => void }) {
  const options = useQuery(api.storefront.orders.switchOptions, {
    orderId: card.orderId,
  });
  const switchFulfilment = useMutation(api.storefront.orders.switchFulfilment);
  const [picked, setPicked] = useState<string>();
  const [address, setAddress] = useState<Address>(() => addressOf(card));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const choice = options?.choices.find((c) => keyOf(c) === picked);
  const needsAddress = choice?.method === "delivery";
  const addressReady =
    !needsAddress || (address.area.trim() !== "" && address.landmark.trim() !== "");
  const close = () => !busy && onClose();

  async function confirm() {
    if (!choice) return;
    setBusy(true);
    setError(undefined);
    try {
      await switchFulfilment({
        orderId: card.orderId,
        expected: choice.effects,
        to:
          choice.method === "pickup"
            ? { method: "pickup" }
            : {
                method: "delivery",
                zoneId: choice.zoneId as Id<"deliveryZones">,
                area: address.area,
                landmark: address.landmark,
                ...(address.street.trim() ? { street: address.street } : {}),
                ...(address.ghanaPostGps.trim() ? { ghanaPostGps: address.ghanaPostGps } : {}),
                ...(address.recipientName.trim() ? { recipientName: address.recipientName } : {}),
                ...(address.recipientPhone.trim()
                  ? { recipientPhone: address.recipientPhone }
                  : {}),
              },
      });
      onClose();
    } catch (e) {
      setError(messageOf(e, "We couldn't change it. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof Address) => ({
    id: `${card.orderId}-${key}`,
    value: address[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setAddress({ ...address, [key]: e.target.value }),
    className: "h-11 text-base md:text-base",
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`switch-${card.orderId}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && close()}
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-card">
        <div className="overflow-y-auto p-5">
          <h2 id={`switch-${card.orderId}`} className="font-semibold text-lg">
            How should {card.reference} reach you?
          </h2>
          {options === undefined ? (
            <p className="mt-3 text-muted-foreground text-sm">Loading…</p>
          ) : !options.switchable ? (
            <p className="mt-3 text-muted-foreground text-sm">This order can't change any more.</p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {options.choices.map((c) => {
                const key = keyOf(c);
                const diff = differenceText(c.difference);
                return (
                  <li key={key}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
                        picked === key ? "border-brand-purple bg-brand-purple-mist" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name={`switch-${card.orderId}`}
                        className="mt-1"
                        checked={picked === key}
                        onChange={() => setPicked(key)}
                      />
                      <span className="flex-1">
                        <span className="font-medium">
                          {c.method === "pickup" ? "Pickup" : `Delivery · ${c.zoneName}`}
                          {c.method === "delivery" && c.current && (
                            <span className="text-muted-foreground"> (now; change address)</span>
                          )}
                        </span>
                        {c.method === "delivery" && (
                          <span className="block text-muted-foreground text-xs">{c.areas}</span>
                        )}
                      </span>
                      <span className="text-right">
                        {c.method === "delivery" && (
                          <span className="block">
                            {c.fee === undefined ? "Quote" : cedi(c.fee)}
                          </span>
                        )}
                        {diff && <span className="block text-brand-purple text-xs">{diff}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {needsAddress && (
            <div className="mt-4 grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${card.orderId}-recipientName`} className="text-sm">
                    Recipient name
                  </Label>
                  <Input {...field("recipientName")} autoComplete="name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${card.orderId}-recipientPhone`} className="text-sm">
                    Recipient phone
                  </Label>
                  <Input {...field("recipientPhone")} type="tel" autoComplete="tel" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${card.orderId}-area`} className="text-sm">
                  Area
                </Label>
                <Input {...field("area")} placeholder="East Legon" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${card.orderId}-street`} className="text-sm">
                  Street and house <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input {...field("street")} autoComplete="street-address" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${card.orderId}-landmark`} className="text-sm">
                  Closest landmark
                </Label>
                <Input {...field("landmark")} placeholder="Opposite the Shell" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${card.orderId}-ghanaPostGps`} className="text-sm">
                  GhanaPost GPS <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input {...field("ghanaPostGps")} placeholder="GA-123-4567" />
              </div>
            </div>
          )}
        </div>

        <div className="border-t bg-brand-purple-mist/60 p-5 pb-8">
          <p className="font-semibold text-sm">What happens to your money</p>
          {choice === undefined ? (
            <p className="mt-1 text-muted-foreground text-sm">Pick how you'd like it.</p>
          ) : choice.effects.length === 0 ? (
            <p className="mt-1 text-sm">No change to what you pay.</p>
          ) : (
            <ul className="mt-1 grid gap-1 text-sm">
              {choice.effects.map((effect, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: effects are a fixed, ordered list
                <li key={`${effect.kind}-${i}`}>{effectText(effect)}</li>
              ))}
            </ul>
          )}
          {choice?.method === "pickup" && (
            <p className="mt-1 text-muted-foreground text-xs">
              We text your Pickup Code when it's ready.
            </p>
          )}
          {error && <p className="mt-3 text-destructive text-sm">{error}</p>}
          <div className="mt-4 grid gap-2">
            <Button
              size="lg"
              className="h-11 w-full text-sm"
              disabled={busy || !choice || !addressReady}
              onClick={confirm}
            >
              {busy ? "Changing…" : "Confirm change"}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="h-11 w-full text-sm"
              disabled={busy}
              onClick={onClose}
            >
              Keep it as it is
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
