// scripts/parity.mjs: the AC1 comparison (exact strings, relations by id).

import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { canon, compareRows } from "../scripts/parity.mjs";

describe("parity compareRows", () => {
  it("compares exact strings, relations by id and lists as JSON, and reports missing rows", () => {
    const fields = ["service { id }", "roi", "totalAgents", "historicalMedianROI", "sma7dUnrealisedPnLWithRewards"];
    const subgraph = new Map<string, unknown>([
      ["0x01", { id: "0x01", service: { id: "0xaa" }, roi: "1.5", totalAgents: 3, historicalMedianROI: ["1", "2"], sma7dUnrealisedPnLWithRewards: null }],
      ["0x02", { id: "0x02", service: { id: "0xaa" }, roi: "1", totalAgents: 3, historicalMedianROI: [], sma7dUnrealisedPnLWithRewards: null }],
    ]);
    const squid = new Map<string, unknown>([
      ["0x01", { id: "0x01", service: { id: "0xaa" }, roi: "1.50", totalAgents: 3, historicalMedianROI: ["1", "2"], sma7dUnrealisedPnLWithRewards: null }],
      ["0x03", { id: "0x03", service: { id: "0xaa" }, roi: "1", totalAgents: 3, historicalMedianROI: [], sma7dUnrealisedPnLWithRewards: null }],
    ]);
    const r = compareRows(subgraph, squid, fields);
    expect(r.diffs).toEqual([{ id: "0x01", field: "roi", subgraph: "1.5", squid: "1.50" }]); // no numeric leniency
    expect([r.onlySubgraph, r.onlySquid, r.compared]).toEqual([["0x02"], ["0x03"], 1]);
    expect([canon(null), canon({ id: "0xaa" }), canon(["1", null]), canon(7)]).toEqual(["null", "id:0xaa", '["1",null]', "7"]);
  });
});
