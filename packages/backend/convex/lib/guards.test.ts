import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";

import { components } from "../_generated/api";
import { setupBackend, type TestBackend } from "../test.setup";
import { requireOwner, requireStaff } from "./guards";

async function addStaff(
  t: TestBackend,
  authUserId: string,
  role: "owner" | "staff",
  status: "active" | "deactivated" = "active",
) {
  await t.run((ctx) =>
    ctx.db.insert("staff", {
      authUserId,
      email: `${authUserId}@emblish.test`,
      name: authUserId,
      role,
      status,
    }),
  );
}

/** A Better Auth user of kind `customer`, as phone sign-in will create them. */
async function addCustomer(t: TestBackend) {
  const now = Date.now();
  const customer = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "user",
      data: {
        name: "Efua",
        email: "233200000000@customers.emblish.test",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
        kind: "customer",
      },
    },
  });
  return (customer as { _id: string })._id;
}

function errorCode(error: unknown) {
  return error instanceof ConvexError ? (error.data as { code: string }).code : error;
}

async function refusal(promise: Promise<unknown>) {
  return promise.then(
    () => "allowed",
    (error) => errorCode(error),
  );
}

describe("requireStaff", () => {
  test("lets an active Owner or Staff member through", async () => {
    const t = setupBackend();
    await addStaff(t, "ama", "owner");
    await addStaff(t, "kofi", "staff");

    const owner = await t.withIdentity({ subject: "ama" }).run((ctx) => requireStaff(ctx));
    const staff = await t.withIdentity({ subject: "kofi" }).run((ctx) => requireStaff(ctx));

    expect(owner).toMatchObject({ name: "ama", role: "owner" });
    expect(staff).toMatchObject({ name: "kofi", role: "staff" });
  });

  test("refuses a deactivated Staff member", async () => {
    const t = setupBackend();
    await addStaff(t, "yaw", "staff", "deactivated");

    const result = await refusal(
      t.withIdentity({ subject: "yaw" }).run((ctx) => requireStaff(ctx)),
    );

    expect(result).toBe("FORBIDDEN");
  });

  test("refuses a Customer session", async () => {
    const t = setupBackend();
    const customer = await addCustomer(t);

    const result = await refusal(
      t.withIdentity({ subject: customer }).run((ctx) => requireStaff(ctx)),
    );

    expect(result).toBe("FORBIDDEN");
  });

  test("refuses when nobody is signed in", async () => {
    const t = setupBackend();

    const result = await refusal(t.run((ctx) => requireStaff(ctx)));

    expect(result).toBe("UNAUTHENTICATED");
  });
});

describe("requireOwner", () => {
  test("lets an active Owner through", async () => {
    const t = setupBackend();
    await addStaff(t, "ama", "owner");

    const owner = await t.withIdentity({ subject: "ama" }).run((ctx) => requireOwner(ctx));

    expect(owner).toMatchObject({ name: "ama", role: "owner" });
  });

  test("refuses a Staff member who isn't an Owner", async () => {
    const t = setupBackend();
    await addStaff(t, "kofi", "staff");

    const result = await refusal(
      t.withIdentity({ subject: "kofi" }).run((ctx) => requireOwner(ctx)),
    );

    expect(result).toBe("FORBIDDEN");
  });

  test("refuses a deactivated Owner", async () => {
    const t = setupBackend();
    await addStaff(t, "ama", "owner", "deactivated");

    const result = await refusal(
      t.withIdentity({ subject: "ama" }).run((ctx) => requireOwner(ctx)),
    );

    expect(result).toBe("FORBIDDEN");
  });

  test("refuses a Customer session", async () => {
    const t = setupBackend();
    const customer = await addCustomer(t);

    const result = await refusal(
      t.withIdentity({ subject: customer }).run((ctx) => requireOwner(ctx)),
    );

    expect(result).toBe("FORBIDDEN");
  });
});
