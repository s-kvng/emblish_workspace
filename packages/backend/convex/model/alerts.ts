import { ConvexError } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { windowAlertBlocked } from "./alertTiming";
import { newDigitCode, newUnsubscribeCode } from "./codes";
import { toGhanaPhone } from "./customers";
import {
  dayMonth,
  isGsm7,
  loginCodeAllowed,
  queueSms,
  renderSms,
  segmentCount,
  smsTemplates,
} from "./sms";

/** Clears a spent or used confirmation code. */
const noConfirmCode = {
  confirmCode: undefined,
  confirmCodeExpiresAt: undefined,
  confirmAttempts: undefined,
};

/** The confirmation code lasts as long as a login code, which the SMS copy says. */
const CODE_LIFETIME = 5 * 60 * 1000;
/** Wrong tries before the code is spent and a new one must be asked for. */
const CODE_ATTEMPTS = 3;

function subscriberByPhone(ctx: Pick<QueryCtx, "db">, phone: string) {
  return ctx.db
    .query("alertSubscribers")
    .withIndex("by_phone", (q) => q.eq("phone", phone))
    .unique();
}

/**
 * The Storefront sign-up, the first half of the double opt-in: the number is left `pending`
 * and texted a code. A confirmed number is texted nothing.
 */
export async function signUpForAlerts(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  typed: string,
): Promise<{ status: "codeSent" | "alreadySubscribed" }> {
  const phone = toGhanaPhone(typed);
  if (!phone) {
    throw new ConvexError({
      code: "INVALID_PHONE",
      message: "Enter a Ghana mobile number, such as 024 123 4567.",
    });
  }
  const existing = await subscriberByPhone(ctx, phone);
  if (existing?.status === "confirmed") return { status: "alreadySubscribed" };
  if (!(await loginCodeAllowed(ctx, phone))) {
    throw new ConvexError({
      code: "TOO_MANY_CODES",
      message: "We've texted this number 3 codes in the last hour. Try again later.",
    });
  }

  const code = newDigitCode();
  const pending = {
    status: "pending" as const,
    confirmCode: code,
    confirmCodeExpiresAt: Date.now() + CODE_LIFETIME,
    confirmAttempts: 0,
  };
  if (existing) await ctx.db.patch(existing._id, pending);
  else {
    await ctx.db.insert("alertSubscribers", {
      phone,
      ...pending,
      unsubscribeCode: await newUnsubscribeCode(ctx),
    });
  }
  await queueSms(ctx, phone, "loginCode", { code });
  return { status: "codeSent" };
}

export type ConfirmResult = {
  status: "confirmed" | "wrongCode" | "codeExpired";
};

/**
 * The second half of the double opt-in: the texted code confirms the number. A wrong code is
 * returned, not thrown, so its counted try isn't rolled back with the mutation.
 */
export async function confirmAlerts(
  ctx: Pick<MutationCtx, "db">,
  typed: string,
  code: string,
): Promise<ConfirmResult> {
  const phone = toGhanaPhone(typed);
  const subscriber = phone ? await subscriberByPhone(ctx, phone) : null;
  if (subscriber?.status === "confirmed") return { status: "confirmed" };
  if (
    !subscriber ||
    subscriber.status !== "pending" ||
    !subscriber.confirmCode ||
    (subscriber.confirmCodeExpiresAt ?? 0) < Date.now()
  ) {
    return { status: "codeExpired" };
  }

  if (subscriber.confirmCode !== code) {
    const attempts = (subscriber.confirmAttempts ?? 0) + 1;
    if (attempts >= CODE_ATTEMPTS) {
      await ctx.db.patch(subscriber._id, noConfirmCode);
      return { status: "codeExpired" };
    }
    await ctx.db.patch(subscriber._id, { confirmAttempts: attempts });
    return { status: "wrongCode" };
  }

  const customer = await ctx.db
    .query("customers")
    .withIndex("by_phone", (q) => q.eq("phone", subscriber.phone))
    .first();
  await ctx.db.patch(subscriber._id, {
    status: "confirmed",
    consentSource: "storefront",
    consentedAt: Date.now(),
    ...noConfirmCode,
    unsubscribedAt: undefined,
    ...(customer ? { customerId: customer._id } : {}),
  });
  return { status: "confirmed" };
}

/** The one-tap `/u/` link: no sign-in, and a second tap changes nothing. */
export async function unsubscribeFromAlerts(
  ctx: Pick<MutationCtx, "db">,
  code: string,
): Promise<{ unsubscribed: boolean }> {
  const subscriber = await ctx.db
    .query("alertSubscribers")
    .withIndex("by_unsubscribeCode", (q) => q.eq("unsubscribeCode", code))
    .unique();
  if (!subscriber) return { unsubscribed: false };
  if (subscriber.status !== "unsubscribed") {
    await ctx.db.patch(subscriber._id, {
      status: "unsubscribed",
      unsubscribedAt: Date.now(),
      ...noConfirmCode,
    });
  }
  return { unsubscribed: true };
}

/** Alerts queued per batch, so one mutation never schedules more sends than Convex allows. */
const ALERT_BATCH = 100;
/** Stands in for each Alert Subscriber's own `/u/` code in the preview and the up-front check. */
const PLACEHOLDER_CODE = "XXXXXXXX";

/** Confirmed Alert Subscribers: whom the next Window Alert would text. */
async function countConfirmed(ctx: Pick<QueryCtx, "db">) {
  let count = 0;
  for await (const _ of ctx.db
    .query("alertSubscribers")
    .withIndex("by_status", (q) => q.eq("status", "confirmed"))) {
    count++;
  }
  return count;
}

/** The latest Window Alert, which the one-a-day cap is checked against. */
function latestWindowAlert(ctx: Pick<QueryCtx, "db">) {
  return ctx.db.query("windowAlerts").withIndex("by_sentAt").order("desc").first();
}

/** The windows that exist, in the order given; with `openOnly`, only the open ones. */
async function getWindows(
  ctx: Pick<QueryCtx, "db">,
  windowIds: Id<"orderWindows">[],
  openOnly: boolean,
) {
  const windows = [];
  for (const windowId of windowIds) {
    const window = await ctx.db.get(windowId);
    if (window && (!openOnly || window.stage === "open")) windows.push(window);
  }
  return windows;
}

/** The windows' Products in the same order, for the SMS and the Back Office. */
async function productsOf(ctx: Pick<QueryCtx, "db">, windows: Doc<"orderWindows">[]) {
  const products = [];
  for (const window of windows) {
    const product = await ctx.db.get(window.productId);
    if (product) products.push(product);
  }
  return products;
}

/**
 * The Window Alert SMS's arguments for these windows, linking to `unsubscribeCode`. One window
 * links to its Product, unless that link would take the text over 2 segments; then it links to
 * the Storefront.
 */
async function windowAlertArgs(
  ctx: Pick<QueryCtx, "db">,
  windows: Doc<"orderWindows">[],
  unsubscribeCode: string,
) {
  const siteUrl = process.env.SITE_URL ?? "";
  const products = await productsOf(ctx, windows);
  const args = {
    products: products.map((product) => ({
      name: product.name,
      url: `${siteUrl}/products/${product.slug}`,
    })),
    orderBy: dayMonth(Math.min(...windows.map((window) => window.closesAt))),
    siteUrl,
    unsubscribeUrl: `${siteUrl}/u/${unsubscribeCode}`,
  };
  const body = smsTemplates.windowAlert.render(args);
  if (isGsm7(body) && segmentCount(body) <= 2) return args;
  return { ...args, products: args.products.map((product) => ({ ...product, url: siteUrl })) };
}

/**
 * The Announce sheet: the open windows to pick from, how many Alert Subscribers the alert would
 * text, the SMS for the picked windows, and the last alert sent.
 */
export async function describeAnnounceSheet(
  ctx: Pick<QueryCtx, "db">,
  windowIds: Id<"orderWindows">[],
) {
  const open = await ctx.db
    .query("orderWindows")
    .withIndex("by_stage_and_closesAt", (q) => q.eq("stage", "open"))
    .collect();
  const openProducts = await productsOf(ctx, open);
  const windows = open.map((window, i) => ({
    windowId: window._id,
    productName: openProducts[i]?.name ?? "",
    number: window.number,
    closesAt: window.closesAt,
    announcedAt: window.announcedAt,
  }));

  const latest = await latestWindowAlert(ctx);
  let lastAlert = null;
  if (latest) {
    const products = await productsOf(ctx, await getWindows(ctx, latest.windowIds, false));
    const staff = await ctx.db.get(latest.staffId);
    lastAlert = {
      sentAt: latest.sentAt,
      products: products.map((product) => product.name),
      recipients: latest.recipients,
      staffName: staff?.name ?? "",
    };
  }

  const picked = await getWindows(ctx, windowIds, true);
  return {
    windows,
    recipients: await countConfirmed(ctx),
    preview:
      picked.length > 0
        ? renderSms("windowAlert", await windowAlertArgs(ctx, picked, PLACEHOLDER_CODE))
        : null,
    lastAlert,
  };
}

const blockedMessage = {
  outsideSmsHours: {
    code: "OUTSIDE_SMS_HOURS",
    message: "Window Alerts go out between 08:00 and 20:00. Announce again then.",
  },
  sentToday: {
    code: "ALREADY_SENT_TODAY",
    message:
      "A Window Alert already went out today. Announce tomorrow, or name several windows in one.",
  },
} as const;

/**
 * Announce: one SMS naming the open windows to every confirmed Alert Subscriber, at most one a
 * day and only in SMS hours. The alert is recorded, and its texts are queued through the
 * outbox in batches by `system/alerts.queueBatch`.
 */
export async function announceWindows(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  staff: Doc<"staff">,
  windowIds: Id<"orderWindows">[],
) {
  const unique = [...new Set(windowIds)];
  const windows = await getWindows(ctx, unique, true);
  if (windows.length === 0 || windows.length !== unique.length) {
    throw new ConvexError({
      code: "NOT_OPEN",
      message: "Pick one or more open windows to announce.",
    });
  }
  const now = Date.now();
  const blocked = windowAlertBlocked(now, (await latestWindowAlert(ctx))?.sentAt);
  if (blocked) throw new ConvexError(blockedMessage[blocked]);
  // Checked first so an empty list doesn't use up the day's one alert.
  const firstConfirmed = await ctx.db
    .query("alertSubscribers")
    .withIndex("by_status", (q) => q.eq("status", "confirmed"))
    .first();
  if (!firstConfirmed) {
    throw new ConvexError({
      code: "NO_SUBSCRIBERS",
      message: "No one has signed up for Window Alerts yet.",
    });
  }

  const windowAlertId = await ctx.db.insert("windowAlerts", {
    sentAt: now,
    windowIds: unique,
    recipients: 0,
    staffId: staff._id,
  });
  for (const window of windows) {
    if (window.announcedAt === undefined) await ctx.db.patch(window._id, { announcedAt: now });
  }
  await ctx.scheduler.runAfter(0, internal.system.alerts.queueBatch, {
    windowAlertId,
    cursor: null,
  });
}

/** Queues one batch of a Window Alert's texts and schedules the next until all are queued. */
export async function queueWindowAlertBatch(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
  windowAlertId: Id<"windowAlerts">,
  cursor: string | null,
) {
  const alert = await ctx.db.get(windowAlertId);
  if (!alert) return;
  const windows = await getWindows(ctx, alert.windowIds, false);
  const page = await ctx.db
    .query("alertSubscribers")
    .withIndex("by_status", (q) => q.eq("status", "confirmed"))
    .paginate({ numItems: ALERT_BATCH, cursor });
  for (const subscriber of page.page) {
    const args = await windowAlertArgs(ctx, windows, subscriber.unsubscribeCode);
    await queueSms(ctx, subscriber.phone, "windowAlert", args, { windowAlertId });
  }
  await ctx.db.patch(windowAlertId, {
    recipients: alert.recipients + page.page.length,
  });
  if (!page.isDone) {
    await ctx.scheduler.runAfter(0, internal.system.alerts.queueBatch, {
      windowAlertId,
      cursor: page.continueCursor,
    });
  }
}
