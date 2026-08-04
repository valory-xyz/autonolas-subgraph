import {
  createPublicClient,
  http,
  keccak256,
  encodePacked,
} from "viem";
import { CONDITIONAL_TOKENS, ZERO_BYTES32 } from "./constants";

// v2 exchanges do not emit TokenRegistered, so outcome tokenIds are derived at
// ConditionPreparation time (same as the subgraph and Envio ports):
//   collectionId = CTF.getCollectionId(0x0, conditionId, indexSet)  — eth_call
//     (alt_bn128 point math; not reproducible off-chain without an EC lib)
//   positionId   = keccak256(collateral ++ collectionId)            — local
// Both functions are pure, so calling at `latest` is exact regardless of the
// event's block, and a process-lifetime memo cannot go stale.
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

const memo = new Map<string, string | null>();

/** Outcome tokenId as a decimal string, or null when the CTF call reverts. */
export async function getOutcomeTokenId(
  conditionId: string,
  collateral: string,
  indexSet: number,
): Promise<string | null> {
  const key = `${conditionId}_${collateral}_${indexSet}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  let result: string | null;
  try {
    const collectionId = await client.readContract({
      address: CONDITIONAL_TOKENS as `0x${string}`,
      abi: CTF_ABI,
      functionName: "getCollectionId",
      args: [
        ZERO_BYTES32 as `0x${string}`,
        conditionId as `0x${string}`,
        BigInt(indexSet),
      ],
    });
    const positionId = keccak256(
      encodePacked(
        ["address", "bytes32"],
        [collateral as `0x${string}`, collectionId],
      ),
    );
    result = BigInt(positionId).toString();
  } catch (_e) {
    result = null;
  }
  memo.set(key, result);
  return result;
}
