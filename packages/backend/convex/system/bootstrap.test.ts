import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import { signIn } from "../test.auth";
import { setupBackend } from "../test.setup";

const firstOwner = {
  email: "Ama@Emblish.test",
  password: "correct-horse-battery",
  name: "Ama Mensah",
};

describe("bootstrap.firstOwner", () => {
  test("creates the first Owner, who can then sign in to the Back Office", async () => {
    const t = setupBackend();

    await t.action(internal.system.bootstrap.firstOwner, firstOwner);

    const response = await signIn(t, "ama@emblish.test", firstOwner.password);
    expect(response.status).toBe(200);
    const { user } = await response.json();
    expect(user.kind).toBe("staff");

    const me = await t.withIdentity({ subject: user.id }).query(api.backOffice.staff.me, {});
    expect(me).toEqual({
      name: "Ama Mensah",
      email: "ama@emblish.test",
      role: "owner",
    });
  });

  test("seeds the single settings row", async () => {
    const t = setupBackend();

    await t.action(internal.system.bootstrap.firstOwner, firstOwner);

    const settings = await t.run((ctx) => ctx.db.query("settings").collect());
    expect(settings).toHaveLength(1);
  });

  test("refuses to run once there is any Staff member", async () => {
    const t = setupBackend();
    await t.action(internal.system.bootstrap.firstOwner, firstOwner);

    await expect(
      t.action(internal.system.bootstrap.firstOwner, {
        email: "kofi@emblish.test",
        password: "another-long-password",
        name: "Kofi",
      }),
    ).rejects.toThrow(/already/i);

    const staff = await t.run((ctx) => ctx.db.query("staff").collect());
    expect(staff).toHaveLength(1);
  });

  test("refuses a password shorter than sign-in allows", async () => {
    const t = setupBackend();

    await expect(
      t.action(internal.system.bootstrap.firstOwner, {
        ...firstOwner,
        password: "short",
      }),
    ).rejects.toThrow(/password/i);
  });
});
