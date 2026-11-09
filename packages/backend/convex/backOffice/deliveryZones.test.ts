import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import { refusal, withFirstOwner, withStaffMember } from "../test.staff";

describe("Delivery Zones", () => {
  test("an Owner adds zones, listed before the seeded Elsewhere in Ghana", async () => {
    const { owner } = await withFirstOwner();

    await owner.mutation(api.backOffice.deliveryZones.create, {
      name: " Accra Central ",
      areas: "Osu, Labone, Cantonments",
      fee: 3000,
    });

    expect(await owner.query(api.backOffice.deliveryZones.list, {})).toMatchObject([
      {
        name: "Accra Central",
        areas: "Osu, Labone, Cantonments",
        fee: 3000,
        isElsewhere: false,
        active: true,
      },
      { name: "Elsewhere in Ghana", isElsewhere: true, active: true },
    ]);
  });

  test("an Owner changes a zone's fee and disables it; zones are never deleted", async () => {
    const { owner } = await withFirstOwner();
    const zoneId = await owner.mutation(api.backOffice.deliveryZones.create, {
      name: "Tema",
      areas: "Community 1-25",
      fee: 4000,
    });

    await owner.mutation(api.backOffice.deliveryZones.update, {
      zoneId,
      name: "Tema",
      areas: "Community 1-25, Sakumono",
      fee: 4500,
    });
    await owner.mutation(api.backOffice.deliveryZones.setActive, {
      zoneId,
      active: false,
    });

    const [tema] = await owner.query(api.backOffice.deliveryZones.list, {});
    expect(tema).toMatchObject({
      areas: "Community 1-25, Sakumono",
      fee: 4500,
      active: false,
      changedBy: "Ama Mensah",
    });
    expect(tema?.changedAt).toBeGreaterThan(0);
  });

  test("a fixed zone needs a name and a whole, positive fee; Elsewhere never has one", async () => {
    const { owner } = await withFirstOwner();
    const create = (name: string, fee: number) =>
      refusal(
        owner.mutation(api.backOffice.deliveryZones.create, {
          name,
          areas: "",
          fee,
        }),
      );

    expect(await create("  ", 3000)).toBe("INVALID_NAME");
    // Zone names go into SMS, which are GSM-7 only and kept short.
    expect(await create("Accra ₵entral", 3000)).toBe("INVALID_NAME");
    expect(await create("A".repeat(41), 3000)).toBe("INVALID_NAME");
    expect(await create("Kasoa", 0)).toBe("INVALID_FEE");
    expect(await create("Kasoa", 12.5)).toBe("INVALID_FEE");

    const zones = await owner.query(api.backOffice.deliveryZones.list, {});
    const elsewhere = zones[zones.length - 1];
    if (!elsewhere) throw new Error("Elsewhere in Ghana wasn't seeded");
    expect(
      await refusal(
        owner.mutation(api.backOffice.deliveryZones.update, {
          zoneId: elsewhere._id,
          name: elsewhere.name,
          areas: "Anywhere else",
          fee: 5000,
        }),
      ),
    ).toBe("ELSEWHERE_HAS_NO_FEE");
  });

  test("Staff see the zones but only an Owner changes them", async () => {
    const { t, owner } = await withFirstOwner();
    const kofi = await withStaffMember(t);
    const zoneId = await owner.mutation(api.backOffice.deliveryZones.create, {
      name: "Tema",
      areas: "",
      fee: 4000,
    });

    expect(await kofi.query(api.backOffice.deliveryZones.list, {})).toHaveLength(2);
    expect(
      await refusal(
        kofi.mutation(api.backOffice.deliveryZones.create, {
          name: "Kasoa",
          areas: "",
          fee: 1,
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await refusal(
        kofi.mutation(api.backOffice.deliveryZones.update, {
          zoneId,
          name: "Tema",
          areas: "",
          fee: 100,
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await refusal(
        kofi.mutation(api.backOffice.deliveryZones.setActive, {
          zoneId,
          active: false,
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});
