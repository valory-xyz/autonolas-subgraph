// What the processor asks the SQD Portal for. The built data source merges
// every addLog() into block-range buckets; `activeAt(b)` flattens the buckets
// covering block b into "address topic0" pairs, so the assertions do not
// depend on how processor.ts groups its addLog() calls.
import { describe, expect, it } from "vitest";
import { dataSource } from "../src/processor";

type LogWhere = { address?: string[]; topic0?: string[] };
type RangeRequest = {
  range: { from: number; to?: number };
  request: { logs?: { where?: LogWhere }[] };
};

const requests = (dataSource as unknown as { requests: RangeRequest[] })
  .requests;

function activeAt(block: number): Set<string> {
  const pairs = new Set<string>();
  for (const r of requests) {
    if (r.range.from > block) continue;
    if (r.range.to != null && block > r.range.to) continue;
    for (const l of r.request.logs ?? []) {
      // an address- or topic-less filter would pull the whole chain; every
      // subscription here must name both
      expect(l.where?.address?.length, "log filter without address").toBeGreaterThan(0);
      expect(l.where?.topic0?.length, "log filter without topic0").toBeGreaterThan(0);
      for (const a of l.where!.address!) {
        for (const t of l.where!.topic0!) pairs.add(`${a.toLowerCase()} ${t}`);
      }
    }
  }
  return pairs;
}

// Polymarket Protocol V2 (docs.polymarket.com/resources/contracts), proxies.
// Deployment blocks: first block at which eth_getCode returns the proxy
// bytecode on Polygon mainnet; the proxy's constructor logs
// (OwnershipTransferred / RolesUpdated / Initialized) are in that block.
//   ExchangeV3      tx 0x802752af6f6ac8714b2e55ab242853c5eb39cbaf36b4ba67b309d342d1953583
//   PositionManager tx 0x5b6d7449146a3435ec0fcd1691b2c3a35df0c98fad40418fe7dc6da943ffc93a
const EXCHANGE_V3 = "0xe3333700ca9d93003f00f0f71f8515005f6c00aa";
const EXCHANGE_V3_DEPLOY_BLOCK = 87_479_471;
const POSITION_MANAGER = "0x006f54f7f9a22e0000cc2ab60031000000ae9fef";
const POSITION_MANAGER_DEPLOY_BLOCK = 87_479_409;

// keccak256 of the event signatures (independent of the generated decoders)
const ORDER_FILLED =
  "0xd543adfd945773f1a62f74f0ee55a5e3b9b1a28262980ba90b1a89f2ea84d8ee"; // OrderFilled(bytes32,address,address,uint8,uint256,uint256,uint256,uint256,bytes32,bytes32)
const TRANSFER_SINGLE =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62"; // TransferSingle(address,address,address,uint256,uint256)
const TRANSFER_BATCH =
  "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb"; // TransferBatch(address,address,address,uint256[],uint256[])

const HEAD = 95_900_000;

// Every subscription on main (base 7d0705d3) with the block it starts at.
// None of them may change.
const START = 78_425_180;
const SERVICE_REGISTRY_START = 80_360_433;
const V2_CUTOVER_START = 85_952_819;
const ADAPTERS_START = 86_219_367;
const LEGACY: [address: string, topic0: string, from: number][] = [
  // ServiceRegistryL2: RegisterInstance, CreateMultisigWithAgents
  ["0xe3607b00e75f6405248323a9417ff6b39b244b50", "0x6835389a6da5341647f18cbe0a89c56f473f4c17bfaee6e6d07d61f1928e0b7c", SERVICE_REGISTRY_START],
  ["0xe3607b00e75f6405248323a9417ff6b39b244b50", "0x2d53f895cd5faf3cddba94a25c2ced2105885b5b37450ff430ffa3cbdf332c74", SERVICE_REGISTRY_START],
  // ConditionalTokens: ConditionPreparation, PayoutRedemption
  ["0x4d97dcd97ec945f40cf65f87097ace5ea0476045", "0xab3760c3bd2bb38b5bcf54dc79802ed67338b4cf29f3054ded67ed24661e4177", START],
  ["0x4d97dcd97ec945f40cf65f87097ace5ea0476045", "0x2682012a4a4f1973119f1c9b90745d1bd91fa2bab387344f044cb3586864d18d", START],
  // OptimisticOracleV3 + UmaCtfAdapter: QuestionInitialized, QuestionResolved
  ["0x65070be91477460d8a7aeeb94ef92fe056c2f2a7", "0xeee0897acd6893adcaf2ba5158191b3601098ab6bece35c5d57874340b64c5b7", START],
  ["0x65070be91477460d8a7aeeb94ef92fe056c2f2a7", "0x566c3fbdd12dd86bb341787f6d531f79fd7ad4ce7e3ae2d15ac0ca1b601af9df", START],
  ["0x157ce2d672854c848c9b79c49a8cc6cc89176a49", "0xeee0897acd6893adcaf2ba5158191b3601098ab6bece35c5d57874340b64c5b7", START],
  ["0x157ce2d672854c848c9b79c49a8cc6cc89176a49", "0x566c3fbdd12dd86bb341787f6d531f79fd7ad4ce7e3ae2d15ac0ca1b601af9df", START],
  // NegRiskAdapter: QuestionPrepared, OutcomeReported, PayoutRedemption
  ["0xd91e80cf2e7be2e162c6513ced06f1dd0da35296", "0xaac410f87d423a922a7b226ac68f0c2eaf5bf6d15e644ac0758c7f96e2c253f7", START],
  ["0xd91e80cf2e7be2e162c6513ced06f1dd0da35296", "0x9e9fa7fd355160bd4cd3f22d4333519354beff1f5689bde87f2c5e63d8d484b2", START],
  ["0xd91e80cf2e7be2e162c6513ced06f1dd0da35296", "0x9140a6a270ef945260c03894b3c6b3b2695e9d5101feef0ff24fec960cfd3224", START],
  // v1 CTF exchanges: OrderFilled, TokenRegistered
  ["0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e", "0xd0a08e8c493f9c94f29311604c9de1b4e8c8d4c06bd0c789af57f2d65bfec0f6", START],
  ["0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e", "0xbc9a2432e8aeb48327246cddd6e872ef452812b4243c04e6bfb786a2cd8faf0d", START],
  ["0xc5d563a36ae78145c45a50134d48a1215220f80a", "0xd0a08e8c493f9c94f29311604c9de1b4e8c8d4c06bd0c789af57f2d65bfec0f6", START],
  ["0xc5d563a36ae78145c45a50134d48a1215220f80a", "0xbc9a2432e8aeb48327246cddd6e872ef452812b4243c04e6bfb786a2cd8faf0d", START],
  // CLOB v2 CTF exchanges: OrderFilled
  ["0xe111180000d2663c0091e4f400237545b87b996b", ORDER_FILLED, V2_CUTOVER_START],
  ["0xe2222d279d744050d28e00520010520000310f59", ORDER_FILLED, V2_CUTOVER_START],
  // CTF collateral adapters: PositionsRedeemed
  ["0xada100db00ca00073811820692005400218fce1f", "0x1daec0b1f629de29b749a189499f43104a80df46a9f34d9ccf73aa59b85fc0c0", ADAPTERS_START],
  ["0xada2005600dec949baf300f4c6120000bdb6eaab", "0x1daec0b1f629de29b749a189499f43104a80df46a9f34d9ccf73aa59b85fc0c0", ADAPTERS_START],
  ["0xada100874d00e3331d00f2007a9c336a65009718", "0x1daec0b1f629de29b749a189499f43104a80df46a9f34d9ccf73aa59b85fc0c0", ADAPTERS_START],
  ["0xada200001000ef00d07553cee7006808f895c6f1", "0x1daec0b1f629de29b749a189499f43104a80df46a9f34d9ccf73aa59b85fc0c0", ADAPTERS_START],
  // DepositWalletFactory: WalletDeployed
  ["0x00000000000fb5c9adea0298d729a0cb3823cc07", "0x7441de0ad639fe5d2bf1c22447715a0528b682385736bb40ae8dd92555eb8276", V2_CUTOVER_START],
];

const NEW_ADDRESSES = new Set([EXCHANGE_V3, POSITION_MANAGER]);

describe("processor subscriptions: Protocol V2", () => {
  it("subscribes to ExchangeV3 OrderFilled from its deployment block, open-ended", () => {
    const pair = `${EXCHANGE_V3} ${ORDER_FILLED}`;
    expect(activeAt(EXCHANGE_V3_DEPLOY_BLOCK - 1).has(pair)).toBe(false);
    for (const b of [EXCHANGE_V3_DEPLOY_BLOCK, 90_000_000, HEAD, 200_000_000]) {
      expect(activeAt(b).has(pair), `ExchangeV3 OrderFilled at block ${b}`).toBe(true);
    }
  });

  it("subscribes to PositionManager TransferSingle and TransferBatch from its deployment block, open-ended", () => {
    for (const topic of [TRANSFER_SINGLE, TRANSFER_BATCH]) {
      const pair = `${POSITION_MANAGER} ${topic}`;
      expect(activeAt(POSITION_MANAGER_DEPLOY_BLOCK - 1).has(pair)).toBe(false);
      for (const b of [POSITION_MANAGER_DEPLOY_BLOCK, 90_000_000, HEAD, 200_000_000]) {
        expect(activeAt(b).has(pair), `PositionManager ${topic} at block ${b}`).toBe(true);
      }
    }
  });

  it("adds exactly the two Protocol V2 contracts and leaves every existing subscription unchanged", () => {
    const probes = [
      START,
      SERVICE_REGISTRY_START - 1,
      SERVICE_REGISTRY_START,
      V2_CUTOVER_START - 1,
      V2_CUTOVER_START,
      ADAPTERS_START,
      POSITION_MANAGER_DEPLOY_BLOCK - 1,
      POSITION_MANAGER_DEPLOY_BLOCK,
      EXCHANGE_V3_DEPLOY_BLOCK,
      HEAD,
    ];
    for (const b of probes) {
      const active = activeAt(b);
      const legacyActive = [...active].filter((p) => !NEW_ADDRESSES.has(p.split(" ")[0]!));
      const expected = LEGACY.filter(([, , from]) => from <= b).map(([a, t]) => `${a} ${t}`);
      expect(legacyActive.sort(), `legacy subscriptions at block ${b}`).toEqual(expected.sort());
    }

    // at head, the only new contracts are ExchangeV3 and PositionManager —
    // no Router, module, AutoRedeemer or other Protocol V2 address
    const newAtHead = new Set(
      [...activeAt(HEAD)].map((p) => p.split(" ")[0]!).filter((a) => !LEGACY.some(([l]) => l === a)),
    );
    expect([...newAtHead].sort()).toEqual([...NEW_ADDRESSES].sort());
  });
});
