#!/usr/bin/env python3
"""Compare a liquidity squid deployment against the chain it indexes.

There is no subgraph to diff against on Robinhood, so the check is against
RPC ground truth at the squid's own indexed block: LP total supply, pool
reserves, LP-transfer count, swap count and the fee sums recomputed from the
raw Swap logs. Every figure must match exactly; a mismatch is a bug in the
handlers, the start block, or the RPC's state window.

Usage:
  ./scripts/verify-vs-chain.py <graphql-url> <rpc-url> [--from-block N]

Requires: pip install web3
"""
import json
import sys
import urllib.request

from web3 import Web3
from eth_abi import decode

TRANSFER = "Transfer(address,address,uint256)"
V2_SWAP = "Swap(address,uint256,uint256,uint256,uint256,address)"
VAULT_SWAP = "Swap(bytes32,address,address,uint256,uint256)"
BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8"
GETLOGS_CHUNK = 4999  # public endpoints cap ranges at 5k or 10k blocks


def gql(url, query):
    req = urllib.request.Request(
        url, data=json.dumps({"query": query}).encode(), headers={"content-type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        body = json.load(r)
    if body.get("errors"):
        raise SystemExit(f"GraphQL errors: {body['errors']}")
    return body["data"]


def logs(w3, address, topics, frm, to):
    out = []
    lo = frm
    while lo <= to:
        hi = min(lo + GETLOGS_CHUNK, to)
        out += w3.eth.get_logs({"address": address, "fromBlock": lo, "toBlock": hi, "topics": topics})
        lo = hi + 1
    return out


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    gql_url, rpc_url = sys.argv[1], sys.argv[2]
    from_block = int(sys.argv[sys.argv.index("--from-block") + 1]) if "--from-block" in sys.argv else None
    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 60}))
    topic = lambda s: "0x" + w3.keccak(text=s).hex().replace("0x", "")

    data = gql(
        gql_url,
        """{ indexerStatusById(id: "1") { blockNumber }
             poolMetrics { id dex poolId token0 reserve0 reserve1 totalSupply swapFeePercentage
                           cumulativeFeesToken0 cumulativeFeesToken1 }
             bptTransfers(limit: 10000) { pool { id } }
             dailyFees(limit: 10000) { pool { id } swapCount } }""",
    )
    at = int(data["indexerStatusById"]["blockNumber"])
    print(f"squid indexed through block {at}")
    ok = True

    for pm in data["poolMetrics"]:
        pool = Web3.to_checksum_address(pm["id"])
        frm = from_block if from_block is not None else 0
        print(f"\n== {pm['dex']} pool {pm['id']}")

        def call(sig, types, to=pool):
            return decode(types, w3.eth.call({"to": to, "data": w3.keccak(text=sig)[:4]}, at))

        supply = call("totalSupply()", ["uint256"])[0]
        if pm["dex"] == "uniswap-v2":
            r = call("getReserves()", ["uint112", "uint112", "uint32"])
            reserves = (r[0], r[1])
        else:
            pid = bytes.fromhex(pm["poolId"][2:])
            res = decode(
                ["address[]", "uint256[]", "uint256"],
                w3.eth.call(
                    {"to": Web3.to_checksum_address(BALANCER_VAULT), "data": w3.keccak(text="getPoolTokens(bytes32)")[:4] + pid},
                    at,
                ),
            )
            reserves = (res[1][0], res[1][1])

        xfers = len(logs(w3, pool, [topic(TRANSFER)], frm, at))
        if pm["dex"] == "uniswap-v2":
            swaps = logs(w3, pool, [topic(V2_SWAP)], frm, at)
            f0 = f1 = 0
            for l in swaps:
                a0, a1, _, _ = decode(["uint256", "uint256", "uint256", "uint256"], l["data"])
                f0 += a0 * 3 // 1000
                f1 += a1 * 3 // 1000
        else:
            swaps = logs(w3, Web3.to_checksum_address(BALANCER_VAULT), [topic(VAULT_SWAP), pm["poolId"]], frm, at)
            fee = int(pm["swapFeePercentage"])
            f0 = f1 = 0
            for l in swaps:
                token_in = "0x" + l["topics"][2].hex()[-40:]
                amount_in, _ = decode(["uint256", "uint256"], l["data"])
                if token_in == pm["token0"]:
                    f0 += amount_in * fee // 10**18
                else:
                    f1 += amount_in * fee // 10**18

        squid_xfers = sum(1 for t in data["bptTransfers"] if t["pool"]["id"] == pm["id"])
        squid_swaps = sum(d["swapCount"] for d in data["dailyFees"] if d["pool"]["id"] == pm["id"])
        checks = [
            ("totalSupply", int(pm["totalSupply"]), supply),
            ("reserve0", int(pm["reserve0"]), reserves[0]),
            ("reserve1", int(pm["reserve1"]), reserves[1]),
            ("lp transfers", squid_xfers, xfers),
            ("swaps", squid_swaps, len(swaps)),
            ("fees token0", int(pm["cumulativeFeesToken0"]), f0),
            ("fees token1", int(pm["cumulativeFeesToken1"]), f1),
        ]
        for name, got, want in checks:
            mark = "OK " if got == want else "MISMATCH"
            ok &= got == want
            print(f"  {mark} {name:13} squid={got} chain={want}")

    print("\nALL MATCH" if ok else "\nMISMATCHES FOUND")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
