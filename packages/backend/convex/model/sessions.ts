import { components } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";

/** Signs a person out everywhere: every page, so no session survives however many devices. */
export async function endAllSessions(ctx: Pick<MutationCtx, "runMutation">, authUserId: string) {
  let cursor: string | null = null;
  do {
    const deleted: { isDone: boolean; continueCursor: string } = await ctx.runMutation(
      components.betterAuth.adapter.deleteMany,
      {
        input: { model: "session", where: [{ field: "userId", value: authUserId }] },
        paginationOpts: { cursor, numItems: 100 },
      },
    );
    cursor = deleted.isDone ? null : deleted.continueCursor;
  } while (cursor !== null);
}
