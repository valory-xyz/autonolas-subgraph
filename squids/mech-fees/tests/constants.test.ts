import { describe, expect, it } from "vitest";
import { CHAINS } from "../src/constants";

describe("CHAINS table", () => {
  it("every address is lowercase and every chain has a native tracker", () => {
    for (const chain of Object.values(CHAINS)) {
      for (const t of chain.trackers) expect(t.address).toBe(t.address.toLowerCase());
      if (chain.burnAddress) expect(chain.burnAddress).toBe(chain.burnAddress.toLowerCase());
      if (chain.nativeUsdFeed) expect(chain.nativeUsdFeed).toBe(chain.nativeUsdFeed.toLowerCase());
      expect(chain.trackers.some((t) => t.model === "native")).toBe(true);
      const models = chain.trackers.map((t) => t.model);
      expect(new Set(models).size).toBe(models.length);
      if (models.includes("nvm")) expect(chain.nvm).not.toBeNull();
    }
  });

  it("Robinhood: native + USDG only, no burn, ETH/USD feed", () => {
    const r = CHAINS.robinhood;
    expect(r.trackers.map((t) => t.model).sort()).toEqual(["native", "token-usdc"]);
    expect(r.burnAddress).toBeNull();
    expect(r.nvm).toBeNull();
    expect(r.olas.kind).toBe("none");
    expect(r.usdcDecimals).toBe(6);
  });
});
