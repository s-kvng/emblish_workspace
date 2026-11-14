"use client";

import { api } from "@emblish_workspace/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";

type State = "working" | "done" | "unknown" | "failed";

/** The one tap: opening the `/u/` link from a Window Alert stops them. No sign-in. */
export default function UnsubscribeView({ code }: { code: string }) {
  const unsubscribe = useMutation(api.storefront.alerts.unsubscribe);
  const [state, setState] = useState<State>("working");

  useEffect(() => {
    // Safe to run twice (Strict Mode): a second unsubscribe changes nothing.
    unsubscribe({ code }).then(
      ({ unsubscribed }) => setState(unsubscribed ? "done" : "unknown"),
      () => setState("failed"),
    );
  }, [code, unsubscribe]);

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-10">
      <h1 className="text-2xl">Window Alerts</h1>
      <p className="mt-4 text-sm">
        {state === "working" && "Stopping your alerts…"}
        {state === "done" && "Done. You won't get any more texts about new Pre-orders."}
        {state === "unknown" && "This link isn't valid. Check the link in the text you got."}
        {state === "failed" && "Something went wrong. Reload the page to try again."}
      </p>
      {state === "done" && (
        <p className="mt-2 text-muted-foreground text-sm">
          Changed your mind? You can sign up again on the{" "}
          <Link href="/#window-alerts" className="font-semibold text-brand-purple">
            home page
          </Link>
          .
        </p>
      )}
    </div>
  );
}
