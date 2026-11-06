import { httpRouter } from "convex/server";

import { httpAction } from "./_generated/server";
import { authComponent, createAuth, nativeAppUrl } from "./auth";

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

export default http;
