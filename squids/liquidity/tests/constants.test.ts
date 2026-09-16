// The header of src/constants.ts warns that a mixed-case address is a silent
// no-match: SQD lowercases log addresses and the handlers compare with `===`,
// so a mis-cased literal indexes nothing and reports no error. mech-fees
// guards its table the same way.
import { describe, expect, it } from "vitest";
import { BALANCER_VAULT, CHAINS } from "../src/constants";

describe("CHAINS table", () => {
  it("every address is lowercase", () => {
    for (const chain of Object.values(CHAINS)) {
      for (const pool of chain.pools) expect(pool.address).toBe(pool.address.toLowerCase());
      expect(chain.balancerVault).toBe(chain.balancerVault.toLowerCase());
      if (chain.nativeUsdFeed) {
        expect(chain.nativeUsdFeed).toBe(chain.nativeUsdFeed.toLowerCase());
      }
    }
  });

  it("every chain has at least one pool, with no duplicate addresses", () => {
    for (const chain of Object.values(CHAINS)) {
      expect(chain.pools.length).toBeGreaterThan(0);
      const addresses = chain.pools.map((p) => p.address);
      expect(new Set(addresses).size).toBe(addresses.length);
    }
  });

  it("every chain uses the shared Balancer vault", () => {
    for (const chain of Object.values(CHAINS)) {
      expect(chain.balancerVault).toBe(BALANCER_VAULT);
    }
  });

  it("Robinhood: one Uniswap V2 pool and an ETH/USD feed", () => {
    const r = CHAINS.robinhood;
    expect(r.chainId).toBe(4663);
    expect(r.pools.map((p) => p.dex)).toEqual(["uniswap-v2"]);
    expect(r.nativeUsdFeed).not.toBeNull();
  });
});
