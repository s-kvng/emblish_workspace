import { describe, expect, test } from "vitest";

import { api, components } from "./_generated/api";
import { requestPasswordReset, resetPassword, signIn } from "./test.auth";
import { captureEmails, linkIn } from "./test.email";
import { firstOwner, withFirstOwner } from "./test.staff";

const emails = captureEmails();

const backOfficeResetScreen = "emblish-back-office://reset-password";

describe("Staff reset a forgotten password by email", () => {
  test("the emailed link opens the app's reset screen, and the new password signs in", async () => {
    const { t } = await withFirstOwner();

    const requested = await requestPasswordReset(t, firstOwner.email, backOfficeResetScreen);
    expect(requested.status).toBe(200);

    const [resetEmail, ...others] = await emails.to(t, firstOwner.email);
    expect(others).toHaveLength(0);
    const link = linkIn(resetEmail);
    const opened = await t.fetch(`${link.pathname}${link.search}`, {
      redirect: "manual",
    });
    expect(opened.status).toBe(302);
    const screen = new URL(opened.headers.get("location")!);
    expect(`${screen.protocol}//${screen.host}`).toBe(backOfficeResetScreen);
    const token = screen.searchParams.get("token")!;

    expect((await resetPassword(t, token, "a-brand-new-password")).status).toBe(200);
    expect((await signIn(t, firstOwner.email, "a-brand-new-password")).status).toBe(200);
    expect((await signIn(t, firstOwner.email, firstOwner.password)).status).toBe(401);
  });

  test("only active Staff are sent a reset link", async () => {
    const { t, owner } = await withFirstOwner();
    // A deactivated Staff member, a Customer, and an email nobody has.
    await owner.mutation(api.backOffice.staff.invite, {
      email: "yaw@emblish.test",
      role: "staff",
    });
    const [invite] = await emails.to(t, "yaw@emblish.test");
    await t.action(api.backOffice.invitation.accept, {
      token: linkIn(invite).searchParams.get("token")!,
      name: "Yaw",
      password: "yaw-long-password",
    });
    const { staff } = await owner.query(api.backOffice.staff.list, {});
    await owner.mutation(api.backOffice.staff.deactivate, {
      staffId: staff.find((member) => member.email === "yaw@emblish.test")!._id,
    });
    const now = Date.now();
    await t.mutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: {
          name: "Efua",
          email: "efua@customers.emblish.test",
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
          kind: "customer",
        },
      },
    });

    for (const email of [
      "yaw@emblish.test",
      "efua@customers.emblish.test",
      "nobody@emblish.test",
    ]) {
      expect((await requestPasswordReset(t, email, backOfficeResetScreen)).status).toBe(200);
      expect(await emails.to(t, email)).toEqual([]);
    }
  });
});
