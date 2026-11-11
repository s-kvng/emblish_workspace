"use client";

import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { Id } from "@emblish_workspace/backend/convex/_generated/dataModel";
import { Button } from "@emblish_workspace/ui/components/button";
import { Input } from "@emblish_workspace/ui/components/input";
import { Label } from "@emblish_workspace/ui/components/label";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { ArrowLeft, Clock, MapPin, Truck } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useBag } from "@/lib/bag";
import { cedi } from "@/lib/money";

import ProductPhoto from "./product-photo";
import SignInForm from "./sign-in-form";

export type Step = "bag" | "phone" | "pickup" | "review";

const titles: Record<Step, string> = {
  bag: "Your bag",
  phone: "Your phone",
  pickup: "Pickup or delivery",
  review: "Review & pay",
};
const order: Step[] = ["bag", "phone", "pickup", "review"];

type Method = "pickup" | "delivery";
type Address = {
  recipientName: string;
  recipientPhone: string;
  area: string;
  street: string;
  landmark: string;
  ghanaPostGps: string;
};
const emptyAddress: Address = {
  recipientName: "",
  recipientPhone: "",
  area: "",
  street: "",
  landmark: "",
  ghanaPostGps: "",
};

/** The message a refused Convex call carries, or a fallback. */
function messageOf(error: unknown, fallback: string) {
  return error instanceof ConvexError && typeof error.data?.message === "string"
    ? (error.data.message as string)
    : fallback;
}

export default function CheckoutView({
  initialStep,
  returnedCheckoutId,
}: {
  initialStep: Step;
  returnedCheckoutId?: string;
}) {
  const router = useRouter();
  const bag = useBag();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const [step, setStep] = useState<Step>(initialStep);
  const [checkoutId, setCheckoutId] = useState(returnedCheckoutId);
  const [name, setName] = useState("");
  const [method, setMethod] = useState<Method>("pickup");
  const [zoneId, setZoneId] = useState("");
  const [address, setAddress] = useState<Address>(emptyAddress);
  const [busy, setBusy] = useState(false);

  // In-stock lines become one Store Order; Pre-order lines one Pre-order per Order Window.
  const inStockBag = bag.lines.filter((line) => !line.windowId);
  const preorderBag = bag.lines.filter((line) => line.windowId);
  const lines = useQuery(api.storefront.catalog.bagLines, {
    variantIds: inStockBag.map((line) => line.variantId),
  });
  const preorderLines = useQuery(api.storefront.catalog.preorderBagLines, {
    lines: preorderBag.map((line) => ({
      variantId: line.variantId,
      windowId: line.windowId ?? "",
    })),
  });
  const me = useQuery(api.storefront.customer.me, isAuthenticated ? {} : "skip");
  const pickupPoint = useQuery(api.storefront.catalog.pickupPoint);
  const zones = useQuery(api.storefront.catalog.deliveryZones);
  const checkout = useQuery(
    api.storefront.checkout.get,
    checkoutId && isAuthenticated ? { checkoutId } : "skip",
  );
  const start = useMutation(api.storefront.checkout.start);
  const release = useMutation(api.storefront.checkout.release);
  const pay = useAction(api.storefront.checkout.pay);
  const refresh = useAction(api.storefront.checkout.refresh);

  // Back from Seev: ask about the payment now instead of waiting for the next poll.
  const refreshed = useRef(false);
  useEffect(() => {
    if (!returnedCheckoutId || !isAuthenticated || refreshed.current) return;
    refreshed.current = true;
    refresh({ checkoutId: returnedCheckoutId }).catch(() => {});
  }, [returnedCheckoutId, isAuthenticated, refresh]);

  // Paid, however we found out (this page, polling or the webhook): on to the Receipt.
  const { clear } = bag;
  useEffect(() => {
    if (checkout?.status === "paid" && checkout.receiptCode) {
      clear();
      router.replace(`/r/${checkout.receiptCode}` as Route);
    }
  }, [checkout, clear, router]);

  // The unpaid return gets one toast; the clock in the header says the rest.
  const toasted = useRef(false);
  useEffect(() => {
    if (returnedCheckoutId && checkout?.status === "pending" && !toasted.current) {
      toasted.current = true;
      toast.info("Payment not completed. Nothing was charged.", {
        description: "Your items are still held.",
      });
    }
  }, [returnedCheckoutId, checkout?.status]);

  const priced = (lines ?? []).map((line) => ({
    ...line,
    quantity: inStockBag.find((l) => l.variantId === line.variantId)?.quantity ?? 0,
  }));
  const pricedPreorders = (preorderLines ?? []).map((line) => ({
    ...line,
    quantity:
      preorderBag.find((l) => l.variantId === line.variantId && l.windowId === line.windowId)
        ?.quantity ?? 0,
  }));
  const windows = windowGroups(pricedPreorders);
  const bagTotal =
    priced.reduce((sum, line) => sum + line.storePrice * line.quantity, 0) +
    pricedPreorders.reduce((sum, line) => sum + line.preorderPrice * line.quantity, 0);
  const pending = checkout?.status === "pending" ? checkout : undefined;
  const zone = zones?.find((z) => z._id === zoneId);
  const orderCount = (priced.length > 0 ? 1 : 0) + windows.length;
  // Only the Store Order pays its Delivery Fee today; each Pre-order pays its own on arrival.
  const deliveryFee = method === "delivery" && priced.length > 0 ? (zone?.fee ?? 0) : 0;
  const totalToday = bagTotal + deliveryFee;
  const blocked =
    priced.some((l) => l.quantity > l.inStock) ||
    pricedPreorders.some((l) => l.left !== undefined && l.quantity > l.left) ||
    windows.some((w) => w.short > 0);
  const customerName = me?.name ?? name.trim();
  const fulfilmentReady =
    method === "pickup" ||
    (zone !== undefined &&
      address.area.trim() !== "" &&
      address.landmark.trim() !== "" &&
      (address.recipientName.trim() !== "" || customerName !== ""));
  const fulfilmentRequest =
    method === "pickup" || !zone
      ? ({ method: "pickup" } as const)
      : {
          method: "delivery" as const,
          zoneId: zone._id,
          area: address.area,
          landmark: address.landmark,
          ...(address.street.trim() ? { street: address.street } : {}),
          ...(address.ghanaPostGps.trim() ? { ghanaPostGps: address.ghanaPostGps } : {}),
          ...(address.recipientName.trim() ? { recipientName: address.recipientName } : {}),
          ...(address.recipientPhone.trim() ? { recipientPhone: address.recipientPhone } : {}),
        };
  const ended = checkout && (checkout.status === "expired" || checkout.status === "released");

  const goTo = async (next: Step) => {
    // Editing the Bag or the Pickup/Delivery choice after Pay releases the Checkout, since both
    // are frozen on it; paying again makes a new one.
    if ((next === "bag" || next === "pickup") && pending && checkoutId) {
      await release({ checkoutId }).catch(() => {});
      setCheckoutId(undefined);
      router.replace("/checkout");
    }
    setStep(next === "phone" && isAuthenticated ? "pickup" : next);
  };

  const back = () => {
    const index = order.indexOf(step);
    if (index === 0) return router.push("/");
    const previous = order[index - 1] ?? "bag";
    goTo(previous === "phone" && isAuthenticated ? "bag" : previous);
  };

  const sendToSeev = async (id: string) => {
    const { checkoutUrl } = await pay({ checkoutId: id });
    window.location.assign(checkoutUrl);
  };

  const payNow = async () => {
    setBusy(true);
    try {
      if (pending && checkoutId) {
        await sendToSeev(checkoutId);
        return;
      }
      const { checkoutId: id } = await start({
        lines: [
          ...priced.map(({ variantId, quantity }) => ({
            variantId: variantId as Id<"variants">,
            quantity,
          })),
          ...pricedPreorders.map(({ variantId, windowId, quantity }) => ({
            variantId: variantId as Id<"variants">,
            windowId: windowId as Id<"orderWindows">,
            quantity,
          })),
        ],
        ...(me?.name ? {} : { name }),
        fulfilment: fulfilmentRequest,
      });
      setCheckoutId(id);
      await sendToSeev(id);
    } catch (error) {
      setBusy(false);
      toast.error(messageOf(error, "Something went wrong. Nothing was charged. Try again."));
    }
  };

  const backToBag = () => {
    setCheckoutId(undefined);
    setStep("bag");
    router.replace("/checkout");
  };

  return (
    <div className="mx-auto flex min-h-[70svh] w-full max-w-md flex-col">
      <div className="bg-brand-purple px-4 pt-3 pb-4 text-white">
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Back" onClick={back} className="-ml-1 p-1">
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="flex-1 font-semibold text-base">{titles[step]}</h1>
          {pending && <Countdown expiresAt={pending.expiresAt} />}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5" aria-hidden>
          {order.map((s, i) => (
            <span
              key={s}
              className={`h-1 rounded-full ${i <= order.indexOf(step) ? "bg-brand-gold-bright" : "bg-white/25"}`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 py-5">
        {step === "bag" && (
          <BagStep
            lines={priced}
            windows={windows}
            loading={lines === undefined || preorderLines === undefined}
            onQuantity={bag.setQuantity}
          />
        )}
        {step === "phone" &&
          (authLoading ? null : isAuthenticated ? (
            <PickupNote />
          ) : (
            <SignInForm next="/checkout?step=pickup" />
          ))}
        {step === "pickup" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 rounded-lg bg-secondary p-1 text-sm">
              {(["pickup", "delivery"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={method === m}
                  onClick={() => setMethod(m)}
                  className={`rounded-md py-2 text-center ${method === m ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"}`}
                >
                  {m === "pickup" ? "Pickup" : "Delivery"}
                </button>
              ))}
            </div>
            {method === "delivery" ? (
              <DeliveryForm
                zones={zones}
                zoneId={zoneId}
                onZone={setZoneId}
                orderCount={orderCount}
                preorderCount={windows.length}
                address={address}
                onAddress={setAddress}
                defaultName={customerName}
                defaultPhone={me?.phone}
              />
            ) : (
              <div className="rounded-lg border bg-card p-4">
                <p className="flex items-center gap-2 font-semibold text-sm">
                  <MapPin className="size-4 text-brand-purple" /> Pickup point
                </p>
                <p className="mt-1 whitespace-pre-line text-sm">
                  {pickupPoint || "We'll text you the pickup point."}
                </p>
                <p className="mt-3 text-muted-foreground text-xs">
                  Your order gets its own Pickup Code by SMS when you pay. Show it when you collect.
                </p>
              </div>
            )}
            {me && !me.name && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm">
                  Your name
                </Label>
                <Input
                  id="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ama Mensah"
                  className="h-11 text-base md:text-base"
                />
                <p className="text-muted-foreground text-xs">So we know who your order is for.</p>
              </div>
            )}
          </div>
        )}
        {step === "review" && (
          <ReviewStep
            lines={
              pending?.lines ?? [
                ...priced.map((line) => ({
                  variantId: line.variantId,
                  productName: line.productName,
                  variantLabel: line.variantLabel,
                  quantity: line.quantity,
                  unitPrice: line.storePrice,
                })),
                ...pricedPreorders.map((line) => ({
                  variantId: line.variantId,
                  orderWindowId: line.windowId,
                  productName: line.productName,
                  variantLabel: line.variantLabel,
                  quantity: line.quantity,
                  unitPrice: line.preorderPrice,
                })),
              ]
            }
            windows={windows}
            name={me?.name ?? name}
            phone={me?.phone}
            pickupPoint={pickupPoint}
            fulfilment={
              pending?.fulfilment ??
              (fulfilmentRequest.method === "delivery" && zone
                ? {
                    method: "delivery",
                    zoneName: zone.name,
                    deliveryFee: zone.fee,
                    recipientName: address.recipientName.trim() || customerName,
                    recipientPhone: address.recipientPhone.trim() || (me?.phone ?? ""),
                    area: address.area.trim(),
                    street: address.street.trim() || undefined,
                    landmark: address.landmark.trim(),
                    ghanaPostGps: address.ghanaPostGps.trim().toUpperCase() || undefined,
                  }
                : { method: "pickup" })
            }
            total={pending?.total ?? totalToday}
            onEdit={(s) => goTo(s)}
          />
        )}
      </div>

      <div className="sticky bottom-0 border-t bg-background p-3">
        {step === "bag" && (
          <Button
            size="lg"
            className="h-11 w-full text-sm"
            disabled={orderCount === 0 || blocked}
            onClick={() => goTo(isAuthenticated ? "pickup" : "phone")}
          >
            {orderCount > 0 ? `Check out · ${cedi(bagTotal)}` : "Your bag is empty"}
          </Button>
        )}
        {step === "pickup" && (
          <Button
            size="lg"
            className="h-11 w-full text-sm"
            disabled={!me || customerName === "" || !fulfilmentReady}
            onClick={() => setStep("review")}
          >
            Continue
          </Button>
        )}
        {step === "review" && (
          <Button
            size="lg"
            className="h-11 w-full text-sm"
            disabled={busy || (!pending && (orderCount === 0 || blocked)) || !isAuthenticated}
            onClick={payNow}
          >
            {busy ? "Opening payment…" : pending ? "Try payment again" : `Pay ${cedi(totalToday)}`}
          </Button>
        )}
      </div>

      {ended && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="expired-title"
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-card p-5 text-center">
            <Clock className="mx-auto size-8 text-brand-purple" />
            <h2 id="expired-title" className="mt-2 font-semibold text-lg">
              Time's up
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              We held your items for 30 minutes. They're back on sale now, and nothing was charged.
              Your bag is saved.
            </p>
            <Button size="lg" className="mt-4 h-11 w-full text-sm" onClick={backToBag}>
              Back to my bag
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

type PricedLine = {
  variantId: string;
  productName: string;
  slug: string;
  variantLabel: string;
  storePrice: number;
  inStock: number;
  imageUrl?: string;
  quantity: number;
};

type PreorderLine = {
  variantId: string;
  windowId: string;
  productName: string;
  slug: string;
  variantLabel: string;
  preorderPrice: number;
  left?: number;
  closesAt: number;
  minimumOrderQuantity?: number;
  imageUrl?: string;
  quantity: number;
};

/** The Bag's Pre-order lines as the Pre-orders they become: one per Order Window. */
type WindowGroup = {
  windowId: string;
  productName: string;
  closesAt: number;
  minimum?: number;
  units: number;
  /** Units still to add before the window's Minimum Order Quantity is met. */
  short: number;
  lines: PreorderLine[];
};

function windowGroups(lines: PreorderLine[]): WindowGroup[] {
  const groups: WindowGroup[] = [];
  for (const line of lines) {
    let group = groups.find((g) => g.windowId === line.windowId);
    if (!group) {
      group = {
        windowId: line.windowId,
        productName: line.productName,
        closesAt: line.closesAt,
        minimum: line.minimumOrderQuantity,
        units: 0,
        short: 0,
        lines: [],
      };
      groups.push(group);
    }
    group.lines.push(line);
    group.units += line.quantity;
    group.short = Math.max(0, (group.minimum ?? 0) - group.units);
  }
  return groups;
}

function closeDay(at: number) {
  return new Date(at).toLocaleDateString("en-GH", {
    day: "numeric",
    month: "short",
  });
}

function BagStep({
  lines,
  windows,
  loading,
  onQuantity,
}: {
  lines: PricedLine[];
  windows: WindowGroup[];
  loading: boolean;
  onQuantity: (variantId: string, quantity: number, windowId?: string) => void;
}) {
  if (loading) return <p className="text-muted-foreground text-sm">Loading your bag…</p>;
  if (lines.length === 0 && windows.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-muted-foreground text-sm">Nothing in your bag yet.</p>
        <Link href="/" className="mt-3 inline-block font-semibold text-brand-purple text-sm">
          Browse what's in stock
        </Link>
      </div>
    );
  }
  const orders = [
    ...(lines.length > 0 ? ["Store Order: ready as soon as you pay."] : []),
    ...windows.map(
      (w) =>
        `Pre-order · ${w.productName}: arrives after the window closes on ${closeDay(w.closesAt)}. Shipping Fee billed then.`,
    ),
  ];
  return (
    <div className="space-y-5">
      {windows.map((window) => (
        <PreorderLines key={window.windowId} window={window} onQuantity={onQuantity} />
      ))}
      {lines.length > 0 && (
        <ul className="divide-y">
          {lines.map((line) => (
            <li key={line.variantId} className="flex gap-3 py-3">
              <ProductPhoto
                url={line.imageUrl}
                alt=""
                sizes="64px"
                className="size-16 shrink-0 rounded-md"
              />
              <div className="min-w-0 flex-1">
                <Link href={`/products/${line.slug}`} className="font-medium text-sm">
                  {line.productName}
                </Link>
                {line.variantLabel && (
                  <p className="text-muted-foreground text-xs">{line.variantLabel}</p>
                )}
                <span className="mt-1 inline-block rounded bg-brand-purple-mist px-1.5 py-0.5 font-semibold text-[10px] text-brand-purple uppercase">
                  In stock
                </span>
                {line.quantity > line.inStock && (
                  <p className="mt-1 text-destructive text-xs">
                    {line.inStock > 0
                      ? `Only ${line.inStock} left. Lower the quantity.`
                      : "Sold out. Remove it to continue."}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-3">
                  <select
                    aria-label={`Quantity of ${line.productName}`}
                    value={line.quantity}
                    onChange={(e) => onQuantity(line.variantId, Number(e.target.value))}
                    className="h-8 rounded-md border bg-card px-2 text-sm"
                  >
                    {Array.from(
                      { length: Math.max(line.quantity, line.inStock, 1) },
                      (_, i) => i + 1,
                    ).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="text-muted-foreground text-xs underline"
                    onClick={() => onQuantity(line.variantId, 0)}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <p className="font-semibold text-sm">{cedi(line.storePrice * line.quantity)}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-lg bg-brand-purple-mist p-4 text-sm">
        <p className="font-semibold">
          {orders.length === 1
            ? "You pay once. We make it 1 order."
            : `You pay once. We split it into ${orders.length} orders.`}
        </p>
        <ol className="mt-1 space-y-0.5 text-muted-foreground">
          {orders.map((text, i) => (
            <li key={text}>
              {i + 1}. {text}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * One Order Window's lines in the Bag, the Pre-order they become. Each line is capped at
 * what's left in the window, and together they must meet its Minimum Order Quantity.
 */
function PreorderLines({
  window,
  onQuantity,
}: {
  window: WindowGroup;
  onQuantity: (variantId: string, quantity: number, windowId?: string) => void;
}) {
  return (
    <section>
      <ul className="divide-y">
        {window.lines.map((line) => (
          <li key={`${line.windowId}:${line.variantId}`} className="flex gap-3 py-3">
            <ProductPhoto
              url={line.imageUrl}
              alt=""
              sizes="64px"
              className="size-16 shrink-0 rounded-md"
            />
            <div className="min-w-0 flex-1">
              <Link href={`/products/${line.slug}`} className="font-medium text-sm">
                {line.productName}
              </Link>
              {line.variantLabel && (
                <p className="text-muted-foreground text-xs">{line.variantLabel}</p>
              )}
              <span className="mt-1 inline-block rounded bg-brand-gold-mist px-1.5 py-0.5 font-semibold text-[10px] text-brand-purple-deep uppercase">
                Pre-order
              </span>
              {line.left !== undefined && line.quantity > line.left && (
                <p className="mt-1 text-destructive text-xs">
                  {line.left > 0
                    ? `Only ${line.left} left in this window. Lower the quantity.`
                    : "Pre-order full for this option. Remove it."}
                </p>
              )}
              <div className="mt-2 flex items-center gap-3">
                <select
                  aria-label={`Quantity of ${line.productName}`}
                  value={line.quantity}
                  onChange={(e) =>
                    onQuantity(line.variantId, Number(e.target.value), line.windowId)
                  }
                  className="h-8 rounded-md border bg-card px-2 text-sm"
                >
                  {Array.from(
                    {
                      length: Math.max(line.quantity, Math.min(line.left ?? 20, 99), 1),
                    },
                    (_, i) => i + 1,
                  ).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="text-muted-foreground text-xs underline"
                  onClick={() => onQuantity(line.variantId, 0, line.windowId)}
                >
                  Remove
                </button>
              </div>
            </div>
            <p className="font-semibold text-sm">{cedi(line.preorderPrice * line.quantity)}</p>
          </li>
        ))}
      </ul>
      {window.short > 0 && (
        <p className="rounded-lg bg-red-50 p-3 text-destructive text-sm dark:bg-red-950/40">
          {window.productName} needs at least {window.minimum} per Pre-order, any mix of options.
          You have {window.units}. Add {window.short} more to continue.
        </p>
      )}
    </section>
  );
}

function PickupNote() {
  return <p className="text-muted-foreground text-sm">You're signed in.</p>;
}

type ReviewLine = {
  variantId: string;
  orderWindowId?: string;
  productName: string;
  variantLabel: string;
  quantity: number;
  unitPrice: number;
};

function ReviewStep({
  lines,
  windows,
  name,
  phone,
  pickupPoint,
  fulfilment,
  total,
  onEdit,
}: {
  lines: ReviewLine[];
  /** The Bag's windows, for each Pre-order's close date. */
  windows: WindowGroup[];
  name?: string;
  phone?: string;
  pickupPoint?: string;
  fulfilment: ReviewFulfilment;
  /** What's paid today: the lines plus any fixed-zone Delivery Fee. */
  total: number;
  onEdit: (step: Step) => void;
}) {
  // One card per order: the In-stock lines first, then one Pre-order per window.
  const store = lines.filter((line) => !line.orderWindowId);
  const orders: {
    windowId?: string;
    closesAt?: number;
    lines: ReviewLine[];
  }[] = [...(store.length > 0 ? [{ lines: store }] : [])];
  for (const line of lines) {
    if (!line.orderWindowId) continue;
    const order = orders.find((o) => o.windowId === line.orderWindowId);
    if (order) order.lines.push(line);
    else {
      orders.push({
        windowId: line.orderWindowId,
        closesAt: windows.find((w) => w.windowId === line.orderWindowId)?.closesAt,
        lines: [line],
      });
    }
  }
  return (
    <div className="space-y-4 text-sm">
      <Block title="Contact" onEdit={() => onEdit("pickup")}>
        <p>{name}</p>
        <p className="text-muted-foreground">{phone}</p>
      </Block>
      {fulfilment.method === "pickup" ? (
        <Block title="Pickup" onEdit={() => onEdit("pickup")}>
          <p className="whitespace-pre-line">{pickupPoint || "Pickup point"}</p>
        </Block>
      ) : (
        <Block title={`Delivery · ${fulfilment.zoneName}`} onEdit={() => onEdit("pickup")}>
          <p>
            {fulfilment.recipientName}{" "}
            <span className="text-muted-foreground">{fulfilment.recipientPhone}</span>
          </p>
          <p className="text-muted-foreground">
            {[fulfilment.street, fulfilment.area].filter(Boolean).join(", ")}, near{" "}
            {fulfilment.landmark}
          </p>
          {fulfilment.ghanaPostGps && (
            <p className="text-muted-foreground">GPS {fulfilment.ghanaPostGps}</p>
          )}
        </Block>
      )}
      {orders.map((order, i) => (
        <div key={order.windowId ?? "store"} className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold">
              Order {i + 1} · {order.windowId ? "Pre-order" : "In stock"}
            </p>
            <button
              type="button"
              className="font-semibold text-brand-purple text-xs"
              onClick={() => onEdit("bag")}
            >
              Edit
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {order.lines.map((line) => (
              <li key={line.variantId} className="flex justify-between gap-3">
                <span>
                  {line.quantity}× {line.productName}
                  {line.variantLabel && (
                    <span className="text-muted-foreground"> · {line.variantLabel}</span>
                  )}
                </span>
                <span>{cedi(line.unitPrice * line.quantity)}</span>
              </li>
            ))}
            {!order.windowId && fulfilment.method === "delivery" && (
              <li className="flex justify-between gap-3">
                <span>Delivery Fee</span>
                <span>
                  {fulfilment.deliveryFee === undefined
                    ? "quoted by SMS"
                    : cedi(fulfilment.deliveryFee)}
                </span>
              </li>
            )}
          </ul>
          <p className="mt-2 text-muted-foreground text-xs">
            {order.windowId
              ? `Item Payment today. Arrives after the window closes${
                  order.closesAt ? ` on ${closeDay(order.closesAt)}` : ""
                }. On arrival: Shipping Fee${
                  fulfilment.method === "delivery" ? " and delivery" : ""
                }, billed then.`
              : fulfilment.method === "pickup"
                ? "Ready for pickup as soon as you pay."
                : fulfilment.deliveryFee === undefined
                  ? "We text you its Delivery Fee to pay before we send it."
                  : "We deliver it as soon as you pay, and text you when it's on its way."}
          </p>
        </div>
      ))}
      <div className="flex justify-between font-semibold text-base">
        <span>Total today</span>
        <span>{cedi(total)}</span>
      </div>
      <p className="text-muted-foreground text-xs">
        You'll pay with mobile money (MTN, Telecel or AT) on Seev Plus's secure page.
      </p>
    </div>
  );
}

function Block({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{title}</p>
        <button type="button" className="font-semibold text-brand-purple text-xs" onClick={onEdit}>
          Edit
        </button>
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** Minutes and seconds left on the Checkout's holds; red under 5 minutes. */
function Countdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, expiresAt - now);
  const minutes = Math.floor(left / 60000);
  const seconds = Math.floor((left % 60000) / 1000);
  return (
    <span
      role="timer"
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold text-xs tabular-nums ${left < 5 * 60 * 1000 ? "bg-red-500 text-white" : "bg-white/15"}`}
      aria-label={`Items held for ${minutes} minutes ${seconds} seconds`}
    >
      <Clock className="size-3" />
      {minutes}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

/** What Review shows of the fulfilment: the frozen one after Pay, else what's been picked. */
type ReviewFulfilment =
  | { method: "pickup" }
  | {
      method: "delivery";
      zoneName: string;
      deliveryFee?: number;
      recipientName: string;
      recipientPhone: string;
      area: string;
      street?: string;
      landmark: string;
      ghanaPostGps?: string;
    };

type Zone = {
  _id: string;
  name: string;
  areas: string;
  fee?: number;
  isElsewhere: boolean;
};

/** The Delivery half of the step: zone dropdown, the per-order fee callout, then the address. */
function DeliveryForm({
  zones,
  zoneId,
  onZone,
  orderCount,
  preorderCount,
  address,
  onAddress,
  defaultName,
  defaultPhone,
}: {
  zones: Zone[] | undefined;
  zoneId: string;
  onZone: (zoneId: string) => void;
  orderCount: number;
  /** Of those, Pre-orders: each pays its Delivery Fee on arrival, not today. */
  preorderCount: number;
  address: Address;
  onAddress: (address: Address) => void;
  defaultName: string;
  defaultPhone?: string;
}) {
  const zone = zones?.find((z) => z._id === zoneId);
  const field = (key: keyof Address) => ({
    id: key,
    value: address[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      onAddress({ ...address, [key]: e.target.value }),
    className: "h-11 text-base md:text-base",
  });
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="zone" className="text-sm">
          Delivery Zone
        </Label>
        <select
          id="zone"
          value={zoneId}
          onChange={(e) => onZone(e.target.value)}
          className="h-11 w-full rounded-md border bg-card px-3 text-base"
        >
          <option value="" disabled>
            {zones === undefined ? "Loading zones…" : "Pick your zone"}
          </option>
          {zones?.map((z) => (
            <option key={z._id} value={z._id}>
              {z.name} · {z.fee === undefined ? "fee quoted by SMS" : cedi(z.fee)}
            </option>
          ))}
        </select>
        {zone?.areas && <p className="text-muted-foreground text-xs">{zone.areas}</p>}
      </div>
      {zone && (
        <div className="flex gap-2 rounded-lg bg-brand-purple-mist p-4 text-sm">
          <Truck className="mt-0.5 size-4 shrink-0 text-brand-purple" />
          {zone.fee === undefined ? (
            <p>
              <span className="font-semibold">Delivery Fee quoted by SMS.</span> We text you the fee
              after you pay, and send your order once it's paid.
            </p>
          ) : (
            <p>
              <span className="font-semibold">
                {orderCount}× {orderCount === 1 ? "delivery" : "deliveries"}, {cedi(zone.fee)} each.
              </span>{" "}
              Every order is delivered separately as it becomes ready.
              {preorderCount > 0 &&
                ` ${preorderCount === orderCount ? "Each" : "A"} Pre-order pays its fee on arrival, with its Shipping Fee.`}
            </p>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="recipientName" className="text-sm">
            Recipient name
          </Label>
          <Input {...field("recipientName")} autoComplete="name" placeholder={defaultName} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recipientPhone" className="text-sm">
            Recipient phone
          </Label>
          <Input
            {...field("recipientPhone")}
            type="tel"
            autoComplete="tel"
            placeholder={defaultPhone}
          />
        </div>
      </div>
      <p className="-mt-2 text-muted-foreground text-xs">
        Leave these blank to receive it yourself. Change them for a gift.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="area" className="text-sm">
          Area
        </Label>
        <Input {...field("area")} placeholder="East Legon" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="street" className="text-sm">
          Street and house <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input {...field("street")} autoComplete="street-address" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="landmark" className="text-sm">
          Closest landmark
        </Label>
        <Input {...field("landmark")} placeholder="Opposite the Shell station" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ghanaPostGps" className="text-sm">
          GhanaPost GPS <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input {...field("ghanaPostGps")} placeholder="GA-123-4567" />
      </div>
    </div>
  );
}
