import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth, nativeAppUrl } from "./auth";
import { deliveryPath, verifyDeliverySignature } from "./model/arkesel";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

// An invitation email's https link hands its token on to the Back Office
// app's accept screen, as Better Auth does for password reset links.
http.route({
  path: "/back-office/invite",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    // Joined by hand: `new URL()` doesn't resolve paths against a custom scheme.
    const screen = `${nativeAppUrl}accept-invite?token=${encodeURIComponent(token)}`;
    return new Response(null, { status: 302, headers: { location: screen } });
  }),
});

// Arkesel's delivery report for one SMS. It's signed over its query parameters, so it is
// checked before anything is read from it. The docs show GET; POST is what we ask for.
const arkeselDelivery = httpAction(async (ctx, request) => {
  const secret = process.env.ARKESEL_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "Set ARKESEL_WEBHOOK_SECRET on the Convex deployment to accept delivery reports.",
    );
    return new Response("Not configured", { status: 500 });
  }
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const verified = await verifyDeliverySignature(
    {
      params,
      timestamp: request.headers.get("X-Arkesel-Webhook-Timestamp"),
      signature: request.headers.get("X-Arkesel-Webhook-Signature"),
    },
    secret,
  );
  if (!verified) return new Response("Bad signature", { status: 401 });

  if (params.sms_id && params.status) {
    await ctx.runMutation(internal.system.sms.recordDelivery, {
      arkeselId: params.sms_id,
      status: params.status,
    });
  }
  return new Response(null, { status: 200 });
});
http.route({ path: deliveryPath, method: "POST", handler: arkeselDelivery });
http.route({ path: deliveryPath, method: "GET", handler: arkeselDelivery });

export default http;
