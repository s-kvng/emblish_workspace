import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { refusal, withFirstOwner, withStaffMember } from "../test.staff";

const settings = {
  location: "Osu, Oxford Street. Mon-Sat 9am-6pm",
  whatsappNumber: "+233241112222",
  callNumber: "+233301234567",
};

describe("Store settings", () => {
  test("an Owner sets the pickup point and contact numbers, which the Storefront shows", async () => {
    const { t, owner } = await withFirstOwner();

    await owner.mutation(api.backOffice.settings.update, {
      ...settings,
      location: `  ${settings.location}\n`,
    });

    expect(await owner.query(api.backOffice.settings.get, {})).toEqual(settings);
    expect(await t.query(api.storefront.catalog.pickupPoint, {})).toBe(settings.location);
  });

  test("Staff see the settings but only an Owner changes them", async () => {
    const { t, owner } = await withFirstOwner();
    const kofi = await withStaffMember(t);
    await owner.mutation(api.backOffice.settings.update, settings);

    expect(await kofi.query(api.backOffice.settings.get, {})).toEqual(settings);
    expect(await refusal(kofi.mutation(api.backOffice.settings.update, settings))).toBe(
      "FORBIDDEN",
    );
  });
});
