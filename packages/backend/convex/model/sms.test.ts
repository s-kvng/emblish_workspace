import { describe, expect, test } from "vitest";

import { isGsm7, segmentCount, smsTemplates } from "./sms";

describe("SMS template registry", () => {
  test.each(Object.entries(smsTemplates))(
    "%s is GSM-7, at most 2 segments, and has no cedi sign",
    (_key, template) => {
      const body = template.render(template.example as never);

      expect(isGsm7(body)).toBe(true);
      expect(segmentCount(body)).toBeLessThanOrEqual(2);
      expect(body).not.toContain("₵");
    },
  );

  test("the login code says it lasts 5 minutes", () => {
    expect(smsTemplates.loginCode.render({ code: "482913" })).toBe(
      "Your Emblish code is 482913. It expires in 5 minutes. Never share it.",
    );
  });
});

describe("GSM-7", () => {
  test("accepts plain English and money written as GHS", () => {
    expect(
      isGsm7("Payment of GHS 1,250.00 received for P-1042. Receipt: emblish.com/r/K7Q2M9XA"),
    ).toBe(true);
  });

  test.each([
    ["the cedi sign", "GH₵ 450"],
    ["an emoji", "Thank you 🙏"],
    ["an en dash", "2 – 9 Dec"],
    ["curly quotes", "“Ankara”"],
    ["a bullet", "• Pickup"],
  ])("refuses %s", (_name, text) => {
    expect(isGsm7(text)).toBe(false);
  });
});

describe("segments", () => {
  test("160 characters fit one segment, 161 need two", () => {
    expect(segmentCount("a".repeat(160))).toBe(1);
    expect(segmentCount("a".repeat(161))).toBe(2);
  });

  test("a long message splits every 153 characters", () => {
    expect(segmentCount("a".repeat(306))).toBe(2);
    expect(segmentCount("a".repeat(307))).toBe(3);
  });

  test("extension characters such as the euro sign take two places", () => {
    expect(segmentCount("€".repeat(80))).toBe(1);
    expect(segmentCount("€".repeat(81))).toBe(2);
  });
});
