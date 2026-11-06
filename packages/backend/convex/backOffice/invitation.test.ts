import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import { signIn } from "../test.auth";
import { captureEmails, linkIn } from "../test.email";
import type { TestBackend } from "../test.setup";
import { refusal, withFirstOwner } from "../test.staff";

const emails = captureEmails();

const DAY = 24 * 60 * 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
});

const kofi = {
  email: "kofi@emblish.test",
  name: "Kofi Boateng",
  password: "kofi-long-password",
};
/** What Kofi types when accepting: everything but the email, which the invitation fixes. */
const kofiSetsUp = { name: kofi.name, password: kofi.password };

/** The token in the invitation emailed to an address. */
async function invitationToken(t: TestBackend, address: string) {
  const [invite] = await emails.to(t, address);
  return linkIn(invite).searchParams.get("token")!;
}

describe("Owner invites Staff", () => {
  test("the invitee is emailed a link that names their role and expires in 7 days", async () => {
    const { t, owner } = await withFirstOwner();

    await owner.mutation(api.backOffice.staff.invite, {
      email: " Kofi@Emblish.test ",
      role: "staff",
    });

    const [invite, ...others] = await emails.to(t, "kofi@emblish.test");
    expect(others).toHaveLength(0);
    expect(invite.text).toContain("invited to the Emblish Back Office as Staff");
    expect(invite.text).toContain("This link expires in 7 days.");
    expect(linkIn(invite).searchParams.get("token")).toBeTruthy();
  });

  test("the emailed link opens the Back Office app's accept screen", async () => {
    const { t, owner } = await withFirstOwner();
    await owner.mutation(api.backOffice.staff.invite, {
      email: kofi.email,
      role: "staff",
    });
    const [invite] = await emails.to(t, kofi.email);
    const link = linkIn(invite);

    const opened = await t.fetch(`${link.pathname}${link.search}`, {
      redirect: "manual",
    });

    expect(opened.status).toBe(302);
    const screen = new URL(opened.headers.get("location")!);
    expect(`${screen.protocol}//${screen.host}`).toBe("emblish-back-office://accept-invite");
    expect(screen.searchParams.get("token")).toBe(link.searchParams.get("token"));
  });
});

describe("Accepting an invitation", () => {
  test("sets their password, makes them Staff with the invited role, and lets them sign in", async () => {
    const { t, owner } = await withFirstOwner();
    await owner.mutation(api.backOffice.staff.invite, {
      email: kofi.email,
      role: "owner",
    });
    const token = await invitationToken(t, kofi.email);

    expect(await t.query(api.backOffice.invitation.lookup, { token })).toEqual({
      status: "open",
      email: kofi.email,
      role: "owner",
    });
    const accepted = await t.action(api.backOffice.invitation.accept, {
      token,
      name: kofi.name,
      password: kofi.password,
    });
    expect(accepted).toEqual({ email: kofi.email });

    const response = await signIn(t, kofi.email, kofi.password);
    expect(response.status).toBe(200);
    const { user } = await response.json();
    const me = await t.withIdentity({ subject: user.id }).query(api.backOffice.staff.me, {});
    expect(me).toEqual({ name: kofi.name, email: kofi.email, role: "owner" });
  });

  test("works once: a used link can't be accepted again", async () => {
    const { t, owner } = await withFirstOwner();
    await owner.mutation(api.backOffice.staff.invite, {
      email: kofi.email,
      role: "staff",
    });
    const token = await invitationToken(t, kofi.email);
    await t.action(api.backOffice.invitation.accept, { token, ...kofiSetsUp });

    expect(await t.query(api.backOffice.invitation.lookup, { token })).toEqual({
      status: "used",
    });
    expect(
      await refusal(t.action(api.backOffice.invitation.accept, { token, ...kofiSetsUp })),
    ).toBe("INVITATION_CLOSED");
  });

  test("the link stops working after 7 days", async () => {
    const { t, owner } = await withFirstOwner();
    await owner.mutation(api.backOffice.staff.invite, {
      email: kofi.email,
      role: "staff",
    });
    const token = await invitationToken(t, kofi.email);

    vi.useFakeTimers({ now: Date.now() + 7 * DAY + 60_000, toFake: ["Date"] });

    expect(await t.query(api.backOffice.invitation.lookup, { token })).toEqual({
      status: "expired",
    });
    expect(
      await refusal(t.action(api.backOffice.invitation.accept, { token, ...kofiSetsUp })),
    ).toBe("INVITATION_CLOSED");
    expect((await signIn(t, kofi.email, kofi.password)).status).toBe(401);
  });

  test("a refused password leaves the invitation open to try again", async () => {
    const { t, owner } = await withFirstOwner();
    await owner.mutation(api.backOffice.staff.invite, {
      email: kofi.email,
      role: "staff",
    });
    const token = await invitationToken(t, kofi.email);

    expect(
      await refusal(
        t.action(api.backOffice.invitation.accept, {
          ...kofiSetsUp,
          token,
          password: "short",
        }),
      ),
    ).toBe("INVALID_PASSWORD");
    await t.action(api.backOffice.invitation.accept, { token, ...kofiSetsUp });

    expect((await signIn(t, kofi.email, kofi.password)).status).toBe(200);
  });
});
