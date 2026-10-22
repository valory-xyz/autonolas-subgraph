import {
  createPublicClient,
  http,
  keccak256,
  encodePacked,
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionExecutionError,
} from "viem";
import { BINARY_MODULE, CONDITIONAL_TOKENS, ZERO_BYTES32 } from "./constants";

// v2 exchanges do not emit TokenRegistered, so outcome tokenIds are derived at
// ConditionPreparation time (same as the subgraph and Envio ports):
//   collectionId = CTF.getCollectionId(0x0, conditionId, indexSet)  — eth_call
//     (alt_bn128 point math; not reproducible off-chain without an EC lib)
//   positionId   = keccak256(collateral ++ collectionId)            — local
// Both functions are pure, so calling at `latest` is exact regardless of the
// event's block, and a process-lifetime memo cannot go stale.
// BinaryModule.legacyConditionId reads a link that is written when a market
// migrates and does not change afterwards, so reading it at `latest` is exact.
const client = createPublicClient({
  transport: http(
    process.env.RPC_POLYGON_HTTP ?? "https://polygon-bor-rpc.publicnode.com",
    { batch: true },
  ),
});

const CTF_ABI = [
  {
    type: "function",
    name: "getCollectionId",
    stateMutability: "view",
    inputs: [
      { name: "parentCollectionId", type: "bytes32" },
      { name: "conditionId", type: "bytes32" },
      { name: "indexSet", type: "uint256" },
    ],
    outputs: [{ type: "bytes32" }],
  },
] as const;

const BINARY_MODULE_ABI = [
  {
    type: "function",
    name: "legacyConditionId",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes31" }],
    outputs: [{ type: "bytes32" }],
  },
] as const;

const memo = new Map<string, string | null>();

/**
 * Outcome tokenId as a decimal string, or null when the CTF call REVERTS
 * (mirrors the subgraph's try_/reverted path — a revert is a permanent
 * property of the inputs). Transport errors are rethrown, never cached:
 * the SQD batch retry re-runs the handler and the call gets another chance.
 */
export async function getOutcomeTokenId(
  conditionId: string,
  collateral: string,
  indexSet: number,
): Promise<string | null> {
  const key = `${conditionId}_${collateral}_${indexSet}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  let collectionId: `0x${string}`;
  try {
    collectionId = await client.readContract({
      address: CONDITIONAL_TOKENS as `0x${string}`,
      abi: CTF_ABI,
      functionName: "getCollectionId",
      args: [
        ZERO_BYTES32 as `0x${string}`,
        conditionId as `0x${string}`,
        BigInt(indexSet),
      ],
    });
  } catch (e) {
    const isRevert =
      e instanceof BaseError &&
      (e.walk((err) => err instanceof ContractFunctionRevertedError) != null ||
        (e instanceof ContractFunctionExecutionError &&
          e.message.includes("revert")));
    if (isRevert) {
      console.warn(
        `getCollectionId reverted for condition ${conditionId} indexSet ${indexSet} — market permanently untracked`,
      );
      memo.set(key, null);
      return null;
    }
    console.error(
      `getCollectionId transport error for condition ${conditionId} collateral ${collateral} indexSet ${indexSet}: ${e instanceof Error ? e.message : e}`,
    );
    throw e; // NOT memoized — batch retry will re-attempt
  }
  const positionId = keccak256(
    encodePacked(
      ["address", "bytes32"],
      [collateral as `0x${string}`, collectionId],
    ),
  );
  const result = BigInt(positionId).toString();
  memo.set(key, result);
  return result;
}

/**
 * BinaryModule.legacyConditionId(bytes31) eth_call: the CTF condition ID
 * (bytes32, lowercase 0x-hex) a migrated V1 market had, or ZERO_BYTES32 when
 * the V2 condition was not migrated. `conditionId` is the bytes31 V2
 * condition ID, as decodePositionId returns it.
 */
export async function getLegacyConditionId(
  conditionId: string,
): Promise<string> {
  // transport errors propagate: viem retries the request, then the processor
  // exits and resumes from its last checkpoint on restart (same as
  // getCollectionId)
  const legacy = await client.readContract({
    address: BINARY_MODULE as `0x${string}`,
    abi: BINARY_MODULE_ABI,
    functionName: "legacyConditionId",
    args: [conditionId as `0x${string}`],
  });
  return legacy.toLowerCase();
}
