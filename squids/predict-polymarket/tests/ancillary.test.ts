import { describe, expect, it } from "vitest";
import {
  extractBinaryOutcomes,
  extractTitle,
} from "../src/ancillary";

describe("extractTitle", () => {
  it("strips q:/title: prefixes and stops at res_data", () => {
    expect(
      extractTitle("q: title: Will BTC hit 100k?, res_data: p1: 0, p2: 1"),
    ).toBe("Will BTC hit 100k?");
  });

  it("handles title key appearing mid-string", () => {
    expect(
      extractTitle("some preamble title: ETH above $5000 on Friday?, description: foo"),
    ).toBe("ETH above $5000 on Friday?");
  });

  it("falls back to generic ', word:' delimiter", () => {
    expect(extractTitle("q: Team A vs Team B, start: 2026-01-01")).toBe(
      "Team A vs Team B",
    );
  });
});

describe("extractBinaryOutcomes", () => {
  it("parses explicit p1/p2 mapping with p3 clause", () => {
    expect(
      extractBinaryOutcomes(
        "res_data: p1: 0, p2: 1, p3: 0.5. Outcome Mapping: Where p1 corresponds to Team WE, p2 to EDward Gaming, p3 to unknown/50-50",
      ),
    ).toEqual(["Team WE", "EDward Gaming"]);
  });

  it("keeps labels containing periods (truncates at ', p3' first)", () => {
    expect(
      extractBinaryOutcomes(
        "Where p1 corresponds to Gen.G, p2 to St. Louis, p3 to unknown",
      ),
    ).toEqual(["Gen.G", "St. Louis"]);
  });

  it("parses outcomes: [A, B] lists", () => {
    expect(extractBinaryOutcomes("stuff outcomes: [Yes, No] more")).toEqual([
      "Yes",
      "No",
    ]);
  });

  it("rejects >2 outcome lists", () => {
    expect(extractBinaryOutcomes("outcomes: [A, B, C]")).toEqual([]);
  });

  it("defaults to Yes/No when no outcomes defined", () => {
    expect(extractBinaryOutcomes("q: will it rain?")).toEqual(["Yes", "No"]);
  });
});
