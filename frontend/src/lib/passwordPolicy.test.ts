import { describe, expect, it } from "vitest";

import { getPasswordRequirements, isPasswordValid } from "./passwordPolicy";

describe("passwordPolicy", () => {
  it("accepts a password that meets every requirement", () => {
    expect(isPasswordValid("Kijani!2026")).toBe(true);
  });

  it("rejects passwords that miss a required character type", () => {
    expect(isPasswordValid("kijani!2026")).toBe(false);
    expect(isPasswordValid("KIJANI!2026")).toBe(false);
    expect(isPasswordValid("KijaniPassword!")).toBe(false);
    expect(isPasswordValid("Kijani2026")).toBe(false);
    expect(isPasswordValid("Ki1!")).toBe(false);
  });

  it("reports each unmet rule", () => {
    const requirements = getPasswordRequirements("lowercase");
    expect(requirements.find((requirement) => requirement.id === "lowercase")?.met).toBe(true);
    expect(requirements.filter((requirement) => !requirement.met)).toHaveLength(3);
  });
});
