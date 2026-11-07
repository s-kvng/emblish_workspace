import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { deliveryOutcome, sendSms } from "../model/arkesel";
import { queueSms, redactSms } from "../model/sms";
import { smsStatus } from "../schema";

/** A number gets at most this many login codes an hour. */
const loginCodesPerHour = 3;

/** Asked by Better Auth to text a login code. Refuses once the number has had its hourly share. */
export const queueLoginCode = internalMutation({
  args: { phone: v.string(), code: v.string() },
  returns: v.object({ queued: v.boolean() }),
  handler: async (ctx, { phone, code }) => {
    const recent = await ctx.db
      .query("smsMessages")
      .withIndex("by_to_and_template", (q) =>
        q
          .eq("to", phone)
          .eq("template", "loginCode")
          .gt("_creationTime", Date.now() - 60 * 60 * 1000),
      )
      .take(loginCodesPerHour);
    if (recent.length >= loginCodesPerHour) return { queued: false };
    await queueSms(ctx, phone, "loginCode", { code });
    return { queued: true };
  },
});

export const outboxRow = internalQuery({
  args: { smsMessageId: v.id("smsMessages") },
  returns: v.union(v.null(), v.object({ to: v.string(), body: v.string(), status: smsStatus })),
  handler: async (ctx, { smsMessageId }) => {
    const row = await ctx.db.get(smsMessageId);
    return row && { to: row.to, body: row.body, status: row.status };
  },
});

/** Hands one queued SMS to Arkesel. Scheduled by `queueSms`; nothing else calls Arkesel. */
export const send = internalAction({
  args: { smsMessageId: v.id("smsMessages") },
  returns: v.null(),
  handler: async (ctx, { smsMessageId }) => {
    const row = await ctx.runQuery(internal.system.sms.outboxRow, {
      smsMessageId,
    });
    if (row?.status !== "queued") return null;
    try {
      const arkeselId = await sendSms(row);
      await ctx.runMutation(internal.system.sms.recordSendResult, {
        smsMessageId,
        result: { status: "sent", arkeselId },
      });
    } catch (error) {
      await ctx.runMutation(internal.system.sms.recordSendResult, {
        smsMessageId,
        result: {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
    return null;
  },
});

/** Records what Arkesel said to the send, and masks any secret in the logged body. */
export const recordSendResult = internalMutation({
  args: {
    smsMessageId: v.id("smsMessages"),
    result: v.union(
      v.object({ status: v.literal("sent"), arkeselId: v.string() }),
      v.object({ status: v.literal("failed"), error: v.string() }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { smsMessageId, result }) => {
    const row = await ctx.db.get(smsMessageId);
    if (!row) return null;
    await ctx.db.patch(smsMessageId, { ...result, body: redactSms(row.template, row.body) });
    return null;
  },
});

/** Arkesel's verified delivery report. Unknown ids and in-between statuses change nothing. */
export const recordDelivery = internalMutation({
  args: { arkeselId: v.string(), status: v.string() },
  returns: v.null(),
  handler: async (ctx, { arkeselId, status }) => {
    const outcome = deliveryOutcome(status);
    if (!outcome) return null;
    const row = await ctx.db
      .query("smsMessages")
      .withIndex("by_arkeselId", (q) => q.eq("arkeselId", arkeselId))
      .unique();
    // A late report never undoes a final one.
    if (!row || row.status === "delivered" || row.status === "failed") return null;
    await ctx.db.patch(row._id, {
      status: outcome,
      ...(outcome === "failed" ? { error: `Arkesel reported ${status}` } : {}),
    });
    return null;
  },
});
