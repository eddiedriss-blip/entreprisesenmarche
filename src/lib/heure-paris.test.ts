import { describe, expect, it } from "vitest";
import { isoVersParis, parisVersIso } from "./heure-paris";

describe("heure de Paris", () => {
  it("convertit en hiver (UTC+1) et en été (UTC+2)", () => {
    expect(parisVersIso("2026-11-03T09:00")).toBe("2026-11-03T08:00:00.000Z");
    expect(parisVersIso("2026-07-01T09:00")).toBe("2026-07-01T07:00:00.000Z");
  });

  it("fait l'aller-retour", () => {
    expect(isoVersParis(parisVersIso("2026-03-29T14:30"))).toBe("2026-03-29T14:30");
  });

  it("refuse une saisie invalide", () => {
    expect(parisVersIso("demain")).toBeNull();
    expect(isoVersParis(null)).toBe("");
  });
});
