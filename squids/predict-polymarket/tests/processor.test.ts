// What the processor asks the SQD Portal for. The built data source merges
// every addLog() into block-range buckets; `activeAt(b)` flattens the buckets
// covering block b into "address topic0" pairs.
import { expect, it } from "vitest";
import { dataSource } from "../src/processor";

type RangeRequest = {
  range: { from: number; to?: number };
  request: { logs?: { where?: { address?: string[]; topic0?: string[] } }[] };
};
const requests = (dataSource as unknown as { requests: RangeRequest[] }).requests;

function activeAt(block: number): string[] {
  const pairs = new Set<string>();
  for (const r of requests) {
    if (r.range.from > block || (r.range.to != null && block > r.range.to)) continue;
    for (const l of r.request.logs ?? []) {
      for (const a of l.where?.address ?? ["*"]) {
        for (const t of l.where?.topic0 ?? ["*"]) pairs.add(`${a.toLowerCase()} ${t}`);
      }
    }
  }
  return [...pairs].sort();
}

// keccak256 of the event signatures
const ORDER_FILLED = "0xd543adfd945773f1a62f74f0ee55a5e3b9b1a28262980ba90b1a89f2ea84d8ee";

// Protocol V2 ExchangeV3 proxy (docs.polymarket.com/resources/contracts) and
// its deployment block (first block with proxy bytecode on Polygon mainnet).
// PositionManager transfers are not subscribed: no handler reads them.
const EXCHANGE_V3 = "0xe3333700ca9d93003f00f0f71f8515005f6c00aa";
const V2: [string, string, number][] = [[EXCHANGE_V3, ORDER_FILLED, 87_479_471]];

// Every subscription on main, with the block it starts at.
const OO_INIT = "0xeee0897acd6893adcaf2ba5158191b3601098ab6bece35c5d57874340b64c5b7";
const OO_RESOLVED = "0x566c3fbdd12dd86bb341787f6d531f79fd7ad4ce7e3ae2d15ac0ca1b601af9df";
const V1_FILLED = "0xd0a08e8c493f9c94f29311604c9de1b4e8c8d4c06bd0c789af57f2d65bfec0f6";
const V1_TOKEN_REGISTERED = "0xbc9a2432e8aeb48327246cddd6e872ef452812b4243c04e6bfb786a2cd8faf0d";
const REDEEMED = "0x1daec0b1f629de29b749a189499f43104a80df46a9f34d9ccf73aa59b85fc0c0";
const MAIN: [string[], string[], number][] = [
  [["0xe3607b00e75f6405248323a9417ff6b39b244b50"], ["0x6835389a6da5341647f18cbe0a89c56f473f4c17bfaee6e6d07d61f1928e0b7c", "0x2d53f895cd5faf3cddba94a25c2ced2105885b5b37450ff430ffa3cbdf332c74"], 80_360_433],
  [["0x4d97dcd97ec945f40cf65f87097ace5ea0476045"], ["0xab3760c3bd2bb38b5bcf54dc79802ed67338b4cf29f3054ded67ed24661e4177", "0x2682012a4a4f1973119f1c9b90745d1bd91fa2bab387344f044cb3586864d18d"], 78_425_180],
  [["0x65070be91477460d8a7aeeb94ef92fe056c2f2a7", "0x157ce2d672854c848c9b79c49a8cc6cc89176a49"], [OO_INIT, OO_RESOLVED], 78_425_180],
  [["0xd91e80cf2e7be2e162c6513ced06f1dd0da35296"], ["0xaac410f87d423a922a7b226ac68f0c2eaf5bf6d15e644ac0758c7f96e2c253f7", "0x9e9fa7fd355160bd4cd3f22d4333519354beff1f5689bde87f2c5e63d8d484b2", "0x9140a6a270ef945260c03894b3c6b3b2695e9d5101feef0ff24fec960cfd3224"], 78_425_180],
  [["0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e", "0xc5d563a36ae78145c45a50134d48a1215220f80a"], [V1_FILLED, V1_TOKEN_REGISTERED], 78_425_180],
  [["0xe111180000d2663c0091e4f400237545b87b996b", "0xe2222d279d744050d28e00520010520000310f59"], [ORDER_FILLED], 85_952_819],
  [["0xada100db00ca00073811820692005400218fce1f", "0xada2005600dec949baf300f4c6120000bdb6eaab", "0xada100874d00e3331d00f2007a9c336a65009718", "0xada200001000ef00d07553cee7006808f895c6f1"], [REDEEMED], 86_219_367],
  [["0x00000000000fb5c9adea0298d729a0cb3823cc07"], ["0x7441de0ad639fe5d2bf1c22447715a0528b682385736bb40ae8dd92555eb8276"], 85_952_819],
];

it("adds only ExchangeV3 OrderFilled, from its deployment block, and changes nothing else", () => {
  const expectedAt = (b: number) =>
    [
      ...MAIN.filter(([, , from]) => from <= b).flatMap(([as, ts]) => as.flatMap((a) => ts.map((t) => `${a} ${t}`))),
      ...V2.filter(([, , from]) => from <= b).map(([a, t]) => `${a} ${t}`),
    ].sort();
  for (const b of [78_425_180, 80_360_433, 85_952_819, 86_219_367, 87_479_470, 87_479_471, 200_000_000]) {
    expect(activeAt(b), `subscriptions at block ${b}`).toEqual(expectedAt(b));
  }
});
