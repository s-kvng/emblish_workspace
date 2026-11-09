"use client";

import { api } from "@emblish_workspace/backend/convex/_generated/api";
import type { OrderStatus } from "@emblish_workspace/backend/convex/model/orders";
import { Button } from "@emblish_workspace/ui/components/button";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, ChevronDown, KeyRound, ReceiptText } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import ProductPhoto from "@/components/storefront/product-photo";
import { authClient } from "@/lib/auth-client";
import { cedi } from "@/lib/money";

type Card = FunctionReturnType<typeof api.storefront.orders.mine>[number];
type Filter = "all" | "store" | "past";

/** How each order status reads to a Customer. */
const statusLabel: Record<OrderStatus, string> = {
  awaitingArrival: "Awaiting arrival",
  paymentDue: "Payment due",
  ready: "Ready for pickup",
  collected: "Collected",
  dispatched: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  forfeited: "Forfeited",
};

/** Why money is coming back, in the Customer's words. */
const refundReason: Record<Card["refunds"][number]["reason"], string> = {
  shortfall: "Didn't arrive",
  latePaid: "Sold out before your payment came through",
  cancelledLine: "Item cancelled",
  cancelledPreorder: "Pre-order cancelled",
  afterHandover: "After handover",
  fulfilmentSwitch: "Pickup / delivery change",
  discretionary: "Goodwill refund",
};

const eventLabel: Record<Card["history"][number]["kind"], string> = {
  paid: "Paid",
  collected: "Collected",
};

/** The status line, worded for how the order reaches the Customer. */
function statusText(card: Card) {
  if (card.fulfilment.method === "delivery") {
    if (card.status === "ready") return "Ready for delivery";
    // Elsewhere in Ghana: placed before Staff have quoted its Delivery Fee.
    if (card.status === "paymentDue" && card.fulfilment.deliveryFee === undefined) {
      return "Waiting for our delivery quote";
    }
  }
  return statusLabel[card.status];
}

function day(at: number) {
  return new Date(at).toLocaleDateString("en-GH", { day: "numeric", month: "short" });
}

function dateTime(at: number) {
  return new Date(at).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * My orders: one feed of the Customer's orders as expandable cards, those needing them first.
 * The page only renders once there's a session (the route sends signed-out visitors to sign-in).
 */
export default function MyOrdersView() {
  const router = useRouter();
  const me = useQuery(api.storefront.customer.me);
  const cards = useQuery(api.storefront.orders.mine);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

  const signOut = async () => {
    await authClient.signOut();
    router.replace("/");
    router.refresh();
  };

  const active = cards?.filter((card) => !card.past) ?? [];
  const past = cards?.filter((card) => card.past) ?? [];
  const needing = active.filter((card) => card.needsAction).length;
  const shown =
    filter === "past"
      ? past
      : filter === "store"
        ? active.filter((card) => card.kind === "store")
        : active;
  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: cards?.length ?? 0 },
    { key: "store", label: "Store Orders", count: active.filter((c) => c.kind === "store").length },
    { key: "past", label: "Past", count: past.length },
  ];

  const renderCard = (card: Card) => (
    <OrderCard
      key={card.orderId}
      card={card}
      open={open === card.orderId}
      toggle={() => setOpen((current) => (current === card.orderId ? null : card.orderId))}
      expand={() => setOpen(card.orderId)}
    />
  );

  return (
    <div className="mx-auto w-full max-w-md pb-16">
      <div className="px-4 pt-8">
        <h1 className="font-display font-semibold text-3xl text-brand-purple">My orders</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {cards === undefined
            ? "Loading your orders…"
            : needing > 0
              ? `${needing} ${needing === 1 ? "order needs" : "orders need"} you. ${needing === 1 ? "It's" : "They're"} at the top.`
              : "Nothing needs you right now."}
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Filter orders"
        className="sticky top-0 z-20 flex gap-2 overflow-x-auto bg-background px-4 py-3"
      >
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            role="tab"
            aria-selected={filter === chip.key}
            onClick={() => setFilter(chip.key)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 font-medium text-sm ${
              filter === chip.key
                ? "border-brand-purple bg-brand-purple text-white"
                : "border-border bg-card"
            }`}
          >
            {chip.label}{" "}
            <span className={filter === chip.key ? "text-white/70" : "text-muted-foreground"}>
              {chip.count}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 px-4">
        {cards !== undefined && shown.length === 0 && (
          <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
            {cards.length === 0 ? (
              <>
                You haven't ordered anything yet.{" "}
                <Link href="/" className="font-semibold text-brand-purple">
                  Start shopping
                </Link>
              </>
            ) : (
              "No orders here."
            )}
          </div>
        )}
        {shown.map(renderCard)}

        {filter === "all" && past.length > 0 && (
          <>
            <div className="mt-4 flex items-center gap-3 text-muted-foreground text-xs uppercase tracking-wider">
              <span className="h-px flex-1 bg-border" /> Past orders
              <span className="h-px flex-1 bg-border" />
            </div>
            {past.map(renderCard)}
          </>
        )}
      </div>

      <div className="mt-10 px-4 text-center">
        <p className="text-muted-foreground text-sm">
          Signed in as {me ? (me.name ? `${me.name} · ${me.phone}` : me.phone) : "…"}
        </p>
        <Button variant="outline" size="lg" onClick={signOut} className="mt-3 h-11 w-full text-sm">
          Sign out
        </Button>
      </div>
    </div>
  );
}

/** The horizontal dot tracker. Store Orders: Paid → Ready → Collected (or Delivered). */
function Tracker({ card }: { card: Card }) {
  const ended = card.status === "cancelled" || card.status === "forfeited";
  const dots = ["Paid", "Ready", card.fulfilment.method === "delivery" ? "Delivered" : "Collected"];
  const reached = ended
    ? 0
    : card.status === "collected" || card.status === "delivered"
      ? 3
      : card.status === "ready" || card.status === "dispatched"
        ? 2
        : 1;
  return (
    <div>
      <ol className="grid grid-cols-3" aria-label="Progress">
        {dots.map((dot, i) => {
          const done = i < reached;
          const current = i === reached - 1;
          return (
            <li
              key={dot}
              className="relative flex flex-col items-center"
              aria-current={current ? "step" : undefined}
            >
              {i < dots.length - 1 && (
                <span
                  className={`absolute top-[7px] left-1/2 h-0.5 w-full ${i < reached - 1 ? "bg-brand-purple" : "bg-border"}`}
                />
              )}
              <span
                className={`relative grid size-4 place-items-center rounded-full border-2 ${
                  ended
                    ? "border-border bg-muted"
                    : done
                      ? "border-brand-purple bg-brand-purple"
                      : "border-border bg-card"
                } ${current && !card.past ? "ring-4 ring-brand-gold/40" : ""}`}
              >
                {done && <Check className="size-2.5 text-white" strokeWidth={4} />}
              </span>
              <span
                className={`mt-1 text-center text-[10px] leading-tight ${done ? "" : "text-muted-foreground"}`}
              >
                {dot}
              </span>
            </li>
          );
        })}
      </ol>
      <p className={`mt-2 font-semibold text-sm ${ended ? "text-muted-foreground" : ""}`}>
        {statusText(card)}
      </p>
    </div>
  );
}

function OrderCard({
  card,
  open,
  toggle,
  expand,
}: {
  card: Card;
  open: boolean;
  toggle: () => void;
  expand: () => void;
}) {
  const [first] = card.lines;
  const units = card.lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-card shadow-sm ${
        card.needsAction ? "border-brand-gold" : ""
      }`}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="block w-full text-left"
      >
        <div className="flex h-20 gap-0.5">
          {card.lines.slice(0, 3).map((line) => (
            <ProductPhoto
              key={`${line.productName}-${line.variantLabel}`}
              url={line.imageUrl}
              alt={line.productName}
              sizes="33vw"
              className="h-full flex-1"
            />
          ))}
        </div>
        <div className="grid gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-sm">
                {first?.productName}
                {card.lines.length > 1 && (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    +{card.lines.length - 1} more
                  </span>
                )}
              </p>
              <p className="text-muted-foreground text-xs">
                {card.reference} · Store Order · {units} {units === 1 ? "item" : "items"}
              </p>
            </div>
            <ChevronDown
              className={`mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            />
          </div>
          <Tracker card={card} />
        </div>
      </button>

      {card.pickupCode && !open && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={expand}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-gold font-semibold text-brand-purple-deep text-sm"
          >
            <KeyRound className="size-4" /> Show Pickup Code
          </button>
        </div>
      )}
      {!open && (
        <div className="px-4 pb-4">
          <ReceiptLink card={card} />
        </div>
      )}

      {open && <CardDetail card={card} />}
    </article>
  );
}

function ReceiptLink({ card }: { card: Card }) {
  return (
    <Link
      href={`/r/${card.payment.receiptCode}` as Route}
      className="inline-flex items-center gap-1.5 font-semibold text-brand-purple text-sm"
    >
      <ReceiptText className="size-4" /> Receipt {card.payment.receiptNumber}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      {children}
    </section>
  );
}

function CardDetail({ card }: { card: Card }) {
  const total = card.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  return (
    <div className="grid gap-5 border-t bg-brand-purple-mist/40 p-4">
      {card.pickupCode && (
        <div className="rounded-xl bg-brand-purple p-4 text-center text-white">
          <p className="text-white/70 text-xs">Show this at the pickup point</p>
          <p className="my-1 font-mono font-semibold text-4xl tracking-[0.3em]">
            {card.pickupCode}
          </p>
          {card.fulfilment.method === "pickup" && (
            <p className="whitespace-pre-line text-white/70 text-xs">{card.fulfilment.location}</p>
          )}
        </div>
      )}

      <Section title="Items">
        <ul className="grid gap-1 text-sm">
          {card.lines.map((line) => (
            <li key={`${line.productName}-${line.variantLabel}`} className="flex justify-between gap-3">
              <span>
                {line.quantity}× {line.productName}
                {line.variantLabel && (
                  <span className="text-muted-foreground"> · {line.variantLabel}</span>
                )}
              </span>
              <span>{cedi(line.quantity * line.unitPrice)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t pt-2 text-sm">
          <span>
            Paid <span className="text-muted-foreground">{day(card.payment.paidAt)}</span>
          </span>
          <span className="font-semibold">{cedi(total)}</span>
        </div>
        <ReceiptLink card={card} />
      </Section>

      {card.refunds.length > 0 && (
        <Section title="Refunds">
          <ul className="grid gap-1 text-sm">
            {card.refunds.map((refund, i) => (
              // Refunds have no identity the Customer sees; their order is stable.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              <li key={i} className="flex justify-between gap-3">
                <span>
                  <span className={refund.refunded ? "" : "text-brand-purple"}>
                    {refund.refunded ? "Refunded" : "Refund pending"}
                  </span>
                  <span className="block text-muted-foreground text-xs">
                    {refundReason[refund.reason]}
                  </span>
                </span>
                <span>{cedi(refund.amount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="How you get it">
        {card.fulfilment.method === "pickup" ? (
          <p className="text-sm">
            Pickup
            <span className="block whitespace-pre-line text-muted-foreground text-xs">
              {card.fulfilment.location}
            </span>
          </p>
        ) : (
          <p className="text-sm">
            Delivery · {card.fulfilment.zoneName}
            <span className="block text-muted-foreground text-xs">
              To {card.fulfilment.recipientName} ({card.fulfilment.recipientPhone}),{" "}
              {[card.fulfilment.street, card.fulfilment.area].filter(Boolean).join(", ")}, near{" "}
              {card.fulfilment.landmark}
            </span>
            <span className="block text-muted-foreground text-xs">
              {card.fulfilment.deliveryFee === undefined
                ? "Delivery Fee: we'll text you a quote"
                : `Delivery Fee ${cedi(card.fulfilment.deliveryFee)}, paid`}
            </span>
          </p>
        )}
      </Section>

      <Section title="History">
        <ol className="grid gap-1 text-sm">
          {card.history.map((event) => (
            <li key={`${event.kind}-${event.at}`} className="flex justify-between gap-3">
              <span>{eventLabel[event.kind]}</span>
              <span className="text-muted-foreground">{dateTime(event.at)}</span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
