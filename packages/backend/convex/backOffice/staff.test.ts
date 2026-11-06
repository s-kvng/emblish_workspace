import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { signIn } from "../test.auth";
import { captureEmails, linkIn } from "../test.email";
import type { TestBackend } from "../test.setup";
import { firstOwner, refusal, withFirstOwner } from "../test.staff";

const emails = captureEmails();

/** Calls made as one signed-in person. */
type Caller = ReturnType<TestBackend["withIdentity"]>;

/** Invites someone, has them accept, and returns their sign-in and calls. */
async function addStaff(
  t: TestBackend,
  owner: Caller,
  person: { email: string; name: string; role: "owner" | "staff" },
) {
  const password = `${person.name}-long-password`;
  await owner.mutation(api.backOffice.staff.invite, {
    email: person.email,
    role: person.role,
  });
  const [invite] = await emails.to(t, person.email);
  const token = linkIn(invite).searchParams.get("token")!;
  await t.action(api.backOffice.invitation.accept, {
    token,
    name: person.name,
    password,
  });
  const { user } = await (await signIn(t, person.email, password)).json();
  const listed = await owner.query(api.backOffice.staff.list, {});
  const staffId = listed.staff.find((member) => member.email === person.email)!._id;
  return { staffId, password, calls: t.withIdentity({ subject: user.id }) };
}

async function ownStaffId(caller: Caller) {
  const { staff } = await caller.query(api.backOffice.staff.list, {});
  return staff.find((member) => member.isYou)!._id;
}

describe("More → Staff is for Owners only", () => {
  test("Staff who aren't Owners can't see or manage Staff", async () => {
    const { t, owner } = await withFirstOwner();
    const kofi = await addStaff(t, owner, {
      email: "kofi@emblish.test",
      name: "Kofi",
      role: "staff",
    });
    const ownerId = await ownStaffId(owner);
    const { calls } = kofi;

    const attempts = await Promise.all([
      refusal(calls.query(api.backOffice.staff.list, {})),
      refusal(
        calls.mutation(api.backOffice.staff.invite, {
          email: "x@emblish.test",
          role: "owner",
        }),
      ),
      refusal(
        calls.mutation(api.backOffice.staff.setRole, {
          staffId: kofi.staffId,
          role: "owner",
        }),
      ),
      refusal(calls.mutation(api.backOffice.staff.deactivate, { staffId: ownerId })),
      refusal(calls.mutation(api.backOffice.staff.reactivate, { staffId: ownerId })),
    ]);

    expect(attempts).toEqual(["FORBIDDEN", "FORBIDDEN", "FORBIDDEN", "FORBIDDEN", "FORBIDDEN"]);
  });
});

describe("Owner lists Staff", () => {
  test("shows every Staff member and the invitations still waiting", async () => {
    const { t, owner } = await withFirstOwner();
    await addStaff(t, owner, {
      email: "kofi@emblish.test",
      name: "Kofi",
      role: "staff",
    });
    await owner.mutation(api.backOffice.staff.invite, {
      email: "efua@emblish.test",
      role: "owner",
    });

    const { staff, invitations } = await owner.query(api.backOffice.staff.list, {});

    expect(
      staff.map(({ name, email, role, status, isYou }) => ({
        name,
        email,
        role,
        status,
        isYou,
      })),
    ).toEqual([
      {
        name: firstOwner.name,
        email: firstOwner.email,
        role: "owner",
        status: "active",
        isYou: true,
      },
      {
        name: "Kofi",
        email: "kofi@emblish.test",
        role: "staff",
        status: "active",
        isYou: false,
      },
    ]);
    expect(invitations.map(({ email, role }) => ({ email, role }))).toEqual([
      { email: "efua@emblish.test", role: "owner" },
    ]);
  });
});

describe("Owner invites Staff", () => {
  test("inviting the same email again replaces the earlier link", async () => {
    const { t, owner } = await withFirstOwner();
    await owner.mutation(api.backOffice.staff.invite, {
      email: "kofi@emblish.test",
      role: "staff",
    });
    await owner.mutation(api.backOffice.staff.invite, {
      email: "kofi@emblish.test",
      role: "owner",
    });

    const [first, second] = await emails.to(t, "kofi@emblish.test");
    const token = (email: typeof first) => linkIn(email).searchParams.get("token")!;

    expect(await t.query(api.backOffice.invitation.lookup, { token: token(first) })).toEqual({
      status: "cancelled",
    });
    expect(await t.query(api.backOffice.invitation.lookup, { token: token(second) })).toMatchObject(
      {
        status: "open",
        role: "owner",
      },
    );
    const { invitations } = await owner.query(api.backOffice.staff.list, {});
    expect(invitations).toHaveLength(1);
  });

  test("refuses someone who is already Staff", async () => {
    const { t, owner } = await withFirstOwner();
    await addStaff(t, owner, {
      email: "kofi@emblish.test",
      name: "Kofi",
      role: "staff",
    });

    const result = await refusal(
      owner.mutation(api.backOffice.staff.invite, {
        email: "KOFI@emblish.test",
        role: "owner",
      }),
    );

    expect(result).toBe("ALREADY_STAFF");
  });

  test("an Owner can cancel an invitation, which stops its link working", async () => {
    const { t, owner } = await withFirstOwner();
    await owner.mutation(api.backOffice.staff.invite, {
      email: "kofi@emblish.test",
      role: "staff",
    });
    const [invite] = await emails.to(t, "kofi@emblish.test");
    const { invitations } = await owner.query(api.backOffice.staff.list, {});

    await owner.mutation(api.backOffice.staff.cancelInvitation, {
      invitationId: invitations[0]._id,
    });

    const token = linkIn(invite).searchParams.get("token")!;
    expect(await t.query(api.backOffice.invitation.lookup, { token })).toEqual({
      status: "cancelled",
    });
    expect((await owner.query(api.backOffice.staff.list, {})).invitations).toEqual([]);
  });
});

describe("Owner changes roles", () => {
  test("makes a Staff member an Owner", async () => {
    const { t, owner } = await withFirstOwner();
    const kofi = await addStaff(t, owner, {
      email: "kofi@emblish.test",
      name: "Kofi",
      role: "staff",
    });

    await owner.mutation(api.backOffice.staff.setRole, {
      staffId: kofi.staffId,
      role: "owner",
    });

    expect(await kofi.calls.query(api.backOffice.staff.me, {})).toMatchObject({
      role: "owner",
    });
  });

  test("the last active Owner can't be demoted", async () => {
    const { owner } = await withFirstOwner();

    const result = await refusal(
      owner.mutation(api.backOffice.staff.setRole, {
        staffId: await ownStaffId(owner),
        role: "staff",
      }),
    );

    expect(result).toBe("LAST_OWNER");
    expect(await owner.query(api.backOffice.staff.me, {})).toMatchObject({
      role: "owner",
    });
  });

  test("an Owner can be demoted while another Owner is active", async () => {
    const { t, owner } = await withFirstOwner();
    const efua = await addStaff(t, owner, {
      email: "efua@emblish.test",
      name: "Efua",
      role: "owner",
    });

    await efua.calls.mutation(api.backOffice.staff.setRole, {
      staffId: await ownStaffId(owner),
      role: "staff",
    });

    expect(await owner.query(api.backOffice.staff.me, {})).toMatchObject({
      role: "staff",
    });
  });
});

describe("Owner deactivates Staff", () => {
  test("a deactivated Staff member can't sign in or call the Back Office, and is signed out", async () => {
    const { t, owner } = await withFirstOwner();
    const kofi = await addStaff(t, owner, {
      email: "kofi@emblish.test",
      name: "Kofi",
      role: "staff",
    });
    const session = await signIn(t, "kofi@emblish.test", kofi.password);
    const cookie = session.headers.get("set-cookie")!;

    await owner.mutation(api.backOffice.staff.deactivate, {
      staffId: kofi.staffId,
    });

    expect((await signIn(t, "kofi@emblish.test", kofi.password)).status).toBe(403);
    expect(await refusal(kofi.calls.query(api.backOffice.staff.me, {}))).toBe("FORBIDDEN");
    const stillSignedIn = await t.fetch("/api/auth/get-session", {
      headers: { cookie, origin: "http://localhost:3001" },
    });
    expect(await stillSignedIn.json()).toBeNull();
  });

  test("the last active Owner can't be deactivated", async () => {
    const { t, owner } = await withFirstOwner();
    const efua = await addStaff(t, owner, {
      email: "efua@emblish.test",
      name: "Efua",
      role: "owner",
    });
    await owner.mutation(api.backOffice.staff.deactivate, {
      staffId: efua.staffId,
    });

    const result = await refusal(
      owner.mutation(api.backOffice.staff.deactivate, {
        staffId: await ownStaffId(owner),
      }),
    );

    expect(result).toBe("LAST_OWNER");
    expect(await owner.query(api.backOffice.staff.me, {})).toMatchObject({
      role: "owner",
    });
  });

  test("reactivating lets them sign in again with their old password", async () => {
    const { t, owner } = await withFirstOwner();
    const kofi = await addStaff(t, owner, {
      email: "kofi@emblish.test",
      name: "Kofi",
      role: "staff",
    });
    await owner.mutation(api.backOffice.staff.deactivate, {
      staffId: kofi.staffId,
    });

    await owner.mutation(api.backOffice.staff.reactivate, {
      staffId: kofi.staffId,
    });

    expect((await signIn(t, "kofi@emblish.test", kofi.password)).status).toBe(200);
    expect(await kofi.calls.query(api.backOffice.staff.me, {})).toMatchObject({
      name: "Kofi",
    });
  });
});
