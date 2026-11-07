import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { TestBackend } from "../test.setup";
import { refusal, withFirstOwner, withStaffMember } from "../test.staff";

type Caller = ReturnType<TestBackend["withIdentity"]>;

async function names(caller: Caller) {
  const list = await caller.query(api.backOffice.categories.list, {});
  return list.map((category) => category.name);
}

describe("Categories", () => {
  test("Staff create Categories, which list in the order they were added", async () => {
    const { t } = await withFirstOwner();
    const kofi = await withStaffMember(t);

    await kofi.mutation(api.backOffice.categories.create, { name: " Bags " });
    await kofi.mutation(api.backOffice.categories.create, {
      name: "Hair & wigs",
    });

    expect(await names(kofi)).toEqual(["Bags", "Hair & wigs"]);
  });

  test("a Category can be moved up or down the list", async () => {
    const { owner } = await withFirstOwner();
    for (const name of ["Bags", "Shoes", "Home"]) {
      await owner.mutation(api.backOffice.categories.create, { name });
    }
    const [, , home] = await owner.query(api.backOffice.categories.list, {});

    await owner.mutation(api.backOffice.categories.move, {
      categoryId: home._id,
      direction: "up",
    });
    expect(await names(owner)).toEqual(["Bags", "Home", "Shoes"]);

    await owner.mutation(api.backOffice.categories.move, {
      categoryId: home._id,
      direction: "up",
    });
    await owner.mutation(api.backOffice.categories.move, {
      categoryId: home._id,
      direction: "up",
    });
    expect(await names(owner)).toEqual(["Home", "Bags", "Shoes"]);
  });

  test("a Category can be renamed, and names are unique and not blank", async () => {
    const { owner } = await withFirstOwner();
    const bags = await owner.mutation(api.backOffice.categories.create, {
      name: "Bags",
    });
    await owner.mutation(api.backOffice.categories.create, { name: "Shoes" });

    await owner.mutation(api.backOffice.categories.rename, {
      categoryId: bags,
      name: "Bags & totes",
    });

    expect(await names(owner)).toEqual(["Bags & totes", "Shoes"]);
    expect(await refusal(owner.mutation(api.backOffice.categories.create, { name: "shoes" }))).toBe(
      "DUPLICATE_CATEGORY",
    );
    expect(await refusal(owner.mutation(api.backOffice.categories.create, { name: "  " }))).toBe(
      "INVALID_NAME",
    );
  });

  test("only signed-in Staff reach Categories", async () => {
    const { t } = await withFirstOwner();
    expect(await refusal(t.query(api.backOffice.categories.list, {}))).toBe("UNAUTHENTICATED");
  });
});
