import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { sendPhoneCode, verifyPhoneCode } from "../test.auth";
import { setupBackend, type TestBackend } from "../test.setup";
import { captureSms, codeIn } from "../test.sms";
import { refusal, withStaffMember } from "../test.staff";

const sms = captureSms();
const oldPhone = "+233241234567";
const newPhone = "+233551234567";

/** Signs in on the Storefront with a texted code; returns the verify response. */
async function verifyByPhone(t: TestBackend, phone: string) {
  await sendPhoneCode(t, phone);
  const [text] = await sms.to(t, phone.slice(1));
  const response = await verifyPhoneCode(t, phone, codeIn(text!));
  expect(response.status).toBe(200);
  return response;
}

/** Signs in on the Storefront with a texted code; returns the Better Auth user id. */
async function signInByPhone(t: TestBackend, phone: string) {
  const body = (await (await verifyByPhone(t, phone)).json()) as { user: { id: string } };
  return body.user.id;
}

/** A Customer who has signed in with `oldPhone`, found by Staff through Today's search. */
async function lostNumber() {
  const t = setupBackend();
  const esi = await withStaffMember(t, "Esi Owusu");
  const authUserId = await signInByPhone(t, oldPhone);
  const [found] = await esi.query(api.backOffice.orders.search, { query: oldPhone });
  return { t, esi, authUserId, customerId: found!.customerId };
}

describe("Staff move a Customer to a new phone number", () => {
  test("the new number signs in to the same Customer; the old one starts afresh", async () => {
    const { t, esi, authUserId, customerId } = await lostNumber();

    await esi.mutation(api.backOffice.customers.reassignPhone, {
      customerId,
      phone: "055 123 4567",
    });

    expect(await signInByPhone(t, newPhone)).toBe(authUserId);
    const freshAuthUserId = await signInByPhone(t, oldPhone);
    expect(freshAuthUserId).not.toBe(authUserId);
    const me = await t.withIdentity({ subject: authUserId }).query(api.storefront.customer.me, {});
    expect(me.phone).toBe(newPhone);
  });

  test("the move is recorded with both numbers and the Staff member who made it", async () => {
    const { t, esi, customerId } = await lostNumber();

    await esi.mutation(api.backOffice.customers.reassignPhone, { customerId, phone: newPhone });

    const audit = await t.run(async (ctx) => {
      const rows = await ctx.db.query("phoneReassignments").collect();
      return Promise.all(
        rows.map(async (row) => ({
          customerId: row.customerId,
          oldPhone: row.oldPhone,
          newPhone: row.newPhone,
          staff: (await ctx.db.get(row.staffId))?.name,
        })),
      );
    });
    expect(audit).toEqual([{ customerId, oldPhone, newPhone, staff: "Esi Owusu" }]);
  });

  test("a number that already belongs to another Customer is refused", async () => {
    const { t, esi, authUserId, customerId } = await lostNumber();
    const amaAuthUserId = await signInByPhone(t, newPhone);

    expect(
      await refusal(
        esi.mutation(api.backOffice.customers.reassignPhone, { customerId, phone: newPhone }),
      ),
    ).toBe("PHONE_IN_USE");
    expect(await signInByPhone(t, oldPhone)).toBe(authUserId);
    expect(await signInByPhone(t, newPhone)).toBe(amaAuthUserId);
  });

  test("every device the Customer was signed in on is signed out", async () => {
    const { t, esi, customerId } = await lostNumber();
    const cookie = (await verifyByPhone(t, oldPhone)).headers.get("set-cookie")!;

    await esi.mutation(api.backOffice.customers.reassignPhone, { customerId, phone: newPhone });

    const session = await t.fetch("/api/auth/get-session", {
      headers: { cookie, origin: "http://localhost:3001" },
    });
    expect(await session.json()).toBeNull();
  });

  test("a number that isn't a Ghana mobile, or is already theirs, is refused", async () => {
    const { esi, customerId } = await lostNumber();
    const reassign = (phone: string) =>
      refusal(esi.mutation(api.backOffice.customers.reassignPhone, { customerId, phone }));

    expect(await reassign("055 123")).toBe("INVALID_PHONE");
    expect(await reassign("024 123 4567")).toBe("SAME_PHONE");
  });
});
