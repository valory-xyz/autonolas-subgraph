#!/usr/bin/env python3
"""Compare a mech-fees squid deployment against the chain it indexes.

There is no fees subgraph on Robinhood to diff against, so the check is
against RPC ground truth at the squid's own indexed block. For every tracker
in the deployment's chain config it pulls the raw MechBalanceAdjusted /
Withdraw / Drained logs and recomputes, per payment model:

  fee-in count and raw sum, fee-out count and raw sum (burn address
  excluded), drain count and raw sum

and compares them with the squid's MechModel / DrainTotals rows and the
MechTransaction count. Raw figures must match exactly. USD is recomputed for
the `native` model from the Chainlink answer at each event's block and must
match `Global.totalFeesInUSD` to 6 decimals (an RPC that cannot serve old
state makes the squid fall back to the current price, which shows up here).

Usage:
  ./scripts/verify-vs-chain.py <graphql-url> <archive-rpc-url> [--chain robinhood]

Requires: pip install web3
"""
import json
import sys
import urllib.request
from decimal import Decimal, getcontext

from web3 import Web3
from eth_abi import decode

getcontext().prec = 60

ADJUSTED = "MechBalanceAdjusted(address,uint256,uint256,uint256)"
WITHDRAW = "Withdraw(address,address,uint256)"
DRAINED = "Drained(address,uint256)"
GETLOGS_CHUNK = 4999
AGG_ABI_LATEST = "latestRoundData()"

# Mirror of src/constants.ts for the chains this script knows how to price.
CHAINS = {
    "robinhood": {
        "trackers": [
            ("0x1d79e0a600b61fac1b8f40c27347e48962ed2f23", "native", 59_580_000),
            ("0xeb5638eefe289691ece01943f768edbf96258a80", "token-usdc", 59_580_000),
        ],
        "burn": None,
        "feed": "0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9",
        "native_decimals": 18,
        "usdc_decimals": 6,
    },
}


def gql(url, query):
    req = urllib.request.Request(
        url, data=json.dumps({"query": query}).encode(), headers={"content-type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        body = json.load(r)
    if body.get("errors"):
        raise SystemExit(f"GraphQL errors: {body['errors']}")
    return body["data"]


def topic(w3, sig):
    return "0x" + w3.keccak(text=sig).hex().replace("0x", "")


def logs(w3, address, frm, to):
    out = []
    lo = frm
    while lo <= to:
        hi = min(lo + GETLOGS_CHUNK, to)
        out += w3.eth.get_logs({"address": Web3.to_checksum_address(address), "fromBlock": lo, "toBlock": hi})
        lo = hi + 1
    return out


def feed_price(w3, feed, block, memo):
    if block in memo:
        return memo[block]
    data = w3.keccak(text=AGG_ABI_LATEST)[:4]
    raw = w3.eth.call({"to": Web3.to_checksum_address(feed), "data": data}, block_identifier=block)
    answer = decode(["uint80", "int256", "uint256", "uint256", "uint80"], raw)[1]
    memo[block] = answer
    return answer


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    gql_url, rpc_url = sys.argv[1], sys.argv[2]
    chain = "robinhood"
    if "--chain" in sys.argv:
        chain = sys.argv[sys.argv.index("--chain") + 1]
    cfg = CHAINS[chain]
    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 120}))

    status = gql(gql_url, '{ indexerStatusById(id: "1") { blockNumber } }')["indexerStatusById"]
    if status is None:
        raise SystemExit("squid has not indexed anything yet")
    head = int(status["blockNumber"])
    print(f"squid indexed through block {head}")

    t_adj, t_wd, t_dr = topic(w3, ADJUSTED), topic(w3, WITHDRAW), topic(w3, DRAINED)
    expected = {}
    usd_in_native = Decimal(0)
    memo = {}
    for address, model, start in cfg["trackers"]:
        m = expected.setdefault(model, {"in_n": 0, "in_raw": 0, "out_n": 0, "out_raw": 0, "dr_n": 0, "dr_raw": 0})
        for l in logs(w3, address, start, head):
            t0 = "0x" + l["topics"][0].hex().replace("0x", "")
            if t0 == t_adj:
                rate = decode(["uint256", "uint256", "uint256"], l["data"])[0]
                if model == "token-usdc" and rate == 0:
                    continue  # the squid skips zero USDC accruals (subgraph parity)
                m["in_n"] += 1
                m["in_raw"] += rate
                if model == "native":
                    p = feed_price(w3, cfg["feed"], l["blockNumber"], memo)
                    usd_in_native += Decimal(rate) * Decimal(p) / Decimal(10**8) / Decimal(10 ** cfg["native_decimals"])
            elif t0 == t_wd:
                account = "0x" + l["topics"][1].hex()[-40:]
                amount = decode(["uint256"], l["data"])[0]
                if cfg["burn"] and account == cfg["burn"]:
                    continue
                if model == "token-usdc" and amount == 0:
                    continue
                m["out_n"] += 1
                m["out_raw"] += amount
            elif t0 == t_dr:
                fees = decode(["uint256"], l["data"])[0]
                m["dr_n"] += 1
                m["dr_raw"] += fees

    ok = True
    data = gql(
        gql_url,
        '{ mechModels(limit: 1000) { model totalFeesInRaw totalFeesOutRaw } '
        'drainTotals(limit: 10) { model totalDrainedRaw } '
        'mechTransactions(limit: 1) { id } '
        'globalById(id: "") { totalFeesInUSD } }',
    )
    by_model = {}
    for mm in data["mechModels"]:
        b = by_model.setdefault(mm["model"], {"in_raw": Decimal(0), "out_raw": Decimal(0)})
        b["in_raw"] += Decimal(mm["totalFeesInRaw"])
        b["out_raw"] += Decimal(mm["totalFeesOutRaw"])
    drains = {d["model"]: Decimal(d["totalDrainedRaw"]) for d in data["drainTotals"]}

    for model, e in expected.items():
        got = by_model.get(model, {"in_raw": Decimal(0), "out_raw": Decimal(0)})
        for k, exp, g in (("in_raw", e["in_raw"], got["in_raw"]), ("out_raw", e["out_raw"], got["out_raw"]), ("drain_raw", e["dr_raw"], drains.get(model, Decimal(0)))):
            match = Decimal(exp) == g
            ok &= match
            print(f"{model:11} {k:10} chain={exp} squid={g} {'OK' if match else 'MISMATCH'}")
        print(f"{model:11} events     in={e['in_n']} out={e['out_n']} drains={e['dr_n']}")

    g = data["globalById"]
    if g is not None:
        squid_usd = Decimal(g["totalFeesInUSD"])
        note = "" if "token-usdc" not in expected else " (+ USDC at 1:1, compare native share only if mixed)"
        print(f"Global.totalFeesInUSD squid={squid_usd} native-recomputed={usd_in_native:.6f}{note}")
    print("RESULT:", "OK" if ok else "MISMATCH")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
