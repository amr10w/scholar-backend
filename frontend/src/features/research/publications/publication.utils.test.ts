import { describe, expect, it } from "vitest";
import {
  daysToWeeks,
  formatCost,
  formatIssn,
  formatNumber,
  hasText,
  safePublicationUrl,
  toNumber,
} from "./publication.utils";

describe("hasText", () => {
  it("rejects empty, whitespace, and placeholder strings", () => {
    for (const val of [null, undefined, "", "   ", "Unknown", "N/A", "null", "-", "—"]) {
      expect(hasText(val)).toBe(false);
    }
    expect(hasText("Journal of AI")).toBe(true);
  });
});

describe("formatIssn", () => {
  it("formats 8-char and hyphenated ISSNs into XXXX-XXXX (including trailing X)", () => {
    expect(formatIssn("10769757")).toBe("1076-9757");
    expect(formatIssn("1076-9757")).toBe("1076-9757");
    expect(formatIssn("2041172x")).toBe("2041-172X");
    expect(formatIssn(" 2041-172X ")).toBe("2041-172X");
  });

  it("returns null for empty or placeholder values", () => {
    expect(formatIssn(null)).toBeNull();
    expect(formatIssn("")).toBeNull();
    expect(formatIssn("N/A")).toBeNull();
  });
});

describe("safePublicationUrl", () => {
  it("allows valid http and https URLs", () => {
    expect(safePublicationUrl("https://jair.org")).toBe("https://jair.org");
    expect(safePublicationUrl(" http://example.org/journal?id=1 ")).toBe(
      "http://example.org/journal?id=1",
    );
  });

  it("rejects non-http(s), malformed, or empty URLs", () => {
    expect(safePublicationUrl("ftp://legacy-archive.example.org/journal")).toBeNull();
    expect(safePublicationUrl("javascript:alert(1)")).toBeNull();
    expect(safePublicationUrl("data:text/html,hi")).toBeNull();
    expect(safePublicationUrl("not-a-url")).toBeNull();
    expect(safePublicationUrl(null)).toBeNull();
    expect(safePublicationUrl("")).toBeNull();
  });
});

describe("numeric and pricing helpers", () => {
  it("parses decimal strings and formats numbers/costs", () => {
    expect(toNumber("4.25")).toBe(4.25);
    expect(toNumber(null)).toBeNull();
    expect(daysToWeeks("21")).toBe(3);
    expect(formatNumber(3, " wks")).toBe("3 wks");
    expect(formatNumber(null)).toBe("—");
    expect(formatCost({ cost: "2500", currency: "USD" })).toBe("$2,500");
    expect(formatCost(null)).toBe("—");
  });
});
