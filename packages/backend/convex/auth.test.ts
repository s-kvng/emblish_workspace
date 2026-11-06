import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import { signIn, signUp } from "./test.auth";
import { setupBackend } from "./test.setup";

const owner = {
  email: "ama@emblish.test",
  password: "correct-horse-battery",
  name: "Ama Mensah",
};

async function withOwner() {
  const t = setupBackend();
  await t.action(internal.system.bootstrap.firstOwner, owner);
  return t;
}

describe("Back Office email sign-in", () => {
  test("refuses a wrong password", async () => {
    const t = await withOwner();

    const response = await signIn(t, owner.email, "not-the-password");

    expect(response.status).toBe(401);
  });

  test("refuses a deactivated Staff member, even with the right password", async () => {
    const t = await withOwner();
    await t.run(async (ctx) => {
      const staff = await ctx.db
        .query("staff")
        .withIndex("by_email", (q) => q.eq("email", owner.email))
        .unique();
      await ctx.db.patch(staff!._id, { status: "deactivated" });
    });

    const response = await signIn(t, owner.email, owner.password);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "NOT_ACTIVE_STAFF" });
  });

  test("has no public sign-up", async () => {
    const t = setupBackend();

    const response = await signUp(t, "stranger@emblish.test", "a-long-enough-password", "Stranger");

    expect(response.status).toBe(400);
    expect((await signIn(t, "stranger@emblish.test", "a-long-enough-password")).status).toBe(401);
  });
});
