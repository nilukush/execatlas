import { describe, expect, it } from "vitest";
import {
  COUNTRIES,
  REGIONS,
  resolveLocation,
  regionLabel,
} from "./locations";

describe("locations dataset integrity", () => {
  it("has unique ISO codes", () => {
    const iso2 = COUNTRIES.map((c) => c.iso2);
    const iso3 = COUNTRIES.map((c) => c.iso3);
    expect(new Set(iso2).size).toBe(iso2.length);
    expect(new Set(iso3).size).toBe(iso3.length);
  });

  it("uses 3-letter ISO currency codes", () => {
    for (const c of COUNTRIES) {
      expect(c.currency).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("covers all six target regions plus remote", () => {
    expect(REGIONS.map((r) => r.id)).toEqual([
      "india",
      "middle-east",
      "southeast-asia",
      "north-africa",
      "europe",
      "north-america",
      "remote",
    ]);
    for (const region of REGIONS.filter((r) => r.id !== "remote")) {
      const members = COUNTRIES.filter((c) => c.region === region.id);
      expect(members.length, `region ${region.id} is empty`).toBeGreaterThan(0);
    }
  });

  it("contains the anchor countries of each region", () => {
    const byIso3 = new Map(COUNTRIES.map((c) => [c.iso3, c]));
    for (const iso3 of [
      "IND", // India
      "ARE", "SAU", "QAT", "ISR", "TUR", // Middle East anchors
      "SGP", "IDN", "MYS", "THA", "VNM", "PHL", // Southeast Asia anchors
      "EGY", "MAR", "DZA", "TUN", // North Africa anchors
      "GBR", "DEU", "FRA", "NLD", "ESP", "POL", "CHE", // Europe anchors
      "USA", "CAN", "MEX", // North America anchors
    ]) {
      expect(byIso3.has(iso3), `missing ${iso3}`).toBe(true);
    }
  });

  it("marks the Gulf and classic expat hubs as expat friendly", () => {
    const byIso3 = new Map(COUNTRIES.map((c) => [c.iso3, c]));
    for (const iso3 of ["ARE", "SAU", "QAT", "OMN", "BHR", "KWT", "SGP", "NLD", "DEU", "GBR", "ARE"]) {
      expect(byIso3.get(iso3)?.expatFriendly, `${iso3} should be expat friendly`).toBe(true);
    }
    expect(byIso3.get("ARE")?.currency).toBe("AED");
    expect(byIso3.get("IND")?.currency).toBe("INR");
    expect(byIso3.get("USA")?.currency).toBe("USD");
  });
});

describe("resolveLocation", () => {
  it("resolves countries from names, aliases and city, country forms", () => {
    expect(resolveLocation("United Arab Emirates")?.country?.iso3).toBe("ARE");
    expect(resolveLocation("UAE")?.country?.iso3).toBe("ARE");
    expect(resolveLocation("Dubai, UAE")?.country?.iso3).toBe("ARE");
    expect(resolveLocation("Dubai, United Arab Emirates")?.country?.iso3).toBe("ARE");
    expect(resolveLocation("Abu Dhabi, United Arab Emirates")?.country?.iso3).toBe("ARE");
    expect(resolveLocation("KSA")?.country?.iso3).toBe("SAU");
    expect(resolveLocation("Riyadh, Saudi Arabia")?.country?.iso3).toBe("SAU");
    expect(resolveLocation("Bengaluru, India")?.country?.iso3).toBe("IND");
    expect(resolveLocation("Bangalore, Karnataka")?.country?.iso3).toBe("IND");
    expect(resolveLocation("Singapore")?.country?.iso3).toBe("SGP");
    expect(resolveLocation("Jakarta, Indonesia")?.country?.iso3).toBe("IDN");
    expect(resolveLocation("London, UK")?.country?.iso3).toBe("GBR");
    expect(resolveLocation("United Kingdom")?.country?.iso3).toBe("GBR");
    expect(resolveLocation("Amsterdam, Netherlands")?.country?.iso3).toBe("NLD");
    expect(resolveLocation("Berlin, Germany")?.country?.iso3).toBe("DEU");
    expect(resolveLocation("New York, NY, United States")?.country?.iso3).toBe("USA");
    expect(resolveLocation("Remote - United States")?.country?.iso3).toBe("USA");
    expect(resolveLocation("Ho Chi Minh City, Vietnam")?.country?.iso3).toBe("VNM");
    expect(resolveLocation("Cairo, Egypt")?.country?.iso3).toBe("EGY");
  });

  it("resolves region-level names without a country", () => {
    expect(resolveLocation("Middle East")).toEqual({
      country: null,
      region: "middle-east",
      remote: false,
      raw: "Middle East",
    });
    expect(resolveLocation("south east asia")?.region).toBe("southeast-asia");
    expect(resolveLocation("Southeast Asia")?.region).toBe("southeast-asia");
    expect(resolveLocation("Europe")?.region).toBe("europe");
    expect(resolveLocation("North America")?.region).toBe("north-america");
    expect(resolveLocation("North Africa")?.region).toBe("north-africa");
    expect(resolveLocation("GCC")?.region).toBe("middle-east");
  });

  it("treats remote wordings as remote", () => {
    expect(resolveLocation("Remote")?.remote).toBe(true);
    expect(resolveLocation("Remote - Worldwide")?.remote).toBe(true);
    expect(resolveLocation("Remote (EMEA)")?.remote).toBe(true);
    expect(resolveLocation("Anywhere (Remote)")?.remote).toBe(true);
  });

  it("returns null for out-of-scope and ambiguous inputs", () => {
    expect(resolveLocation("Brazil")).toBeNull();
    expect(resolveLocation("Australia")).toBeNull();
    expect(resolveLocation("Japan")).toBeNull();
    expect(resolveLocation("EMEA")).toBeNull();
    expect(resolveLocation("Hybrid - Flexible")).toBeNull();
    expect(resolveLocation("Multiple locations")).toBeNull();
  });
});

describe("regionLabel", () => {
  it("returns the canonical region label", () => {
    expect(regionLabel("middle-east")).toBe("Middle East");
    expect(regionLabel("southeast-asia")).toBe("Southeast Asia");
    expect(regionLabel("remote")).toBe("Remote");
  });
});
