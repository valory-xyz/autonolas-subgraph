#!/usr/bin/env python3
"""Compare the pearl-transactions squid's Postgres against a deployed subgraph.

The two stores sit at different block heights and use different ID schemes
(the subgraph concatenates Bytes; the squid joins strings), so nothing is
compared by row id. Everything is matched on SEMANTIC keys, height-capped
to the lower of the two heads:

  1. FundsMovement  — keyed (txHash, logIndex-free category, token, amount,
     from, to). This is the ledger; it is what the wallet renders.
  2. BondMovement   — keyed (txHash, category, token, amount). Bond rows
     live in their own table from schema v2 onward; a complete ledger is
     FundsMovement UNION BondMovement.
  3. MasterSafe     — identity + masterEoa + historyFloorBlock.
  4. Service        — identity + serviceId + agentIds.
  5. DailyServiceFunds for days fully elapsed on BOTH sides.

Usage:
  python3 scripts/compare-vs-subgraph.py <subgraph-graphql-url> [--limit N]

  # Base runs the same v2 schema and is at chain head, so it is the only
  # usable end-to-end baseline today (there is no deployed Polygon
  # endpoint — see MIGRATION.md). Point the squid at Base first:
  python3 scripts/compare-vs-subgraph.py https://transactions-base.subgraph.autonolas.tech

Connects to Postgres via psql using the same DB_* env vars the squid uses,
so it works against a docker-compose container or any other instance.
No python dependencies.
"""
import json
import os
import subprocess
import sys
import urllib.request
from collections import Counter

args = [a for a in sys.argv[1:] if not a.startswith("--")]
if not args:
    sys.exit(__doc__)
SUBGRAPH_URL = args[0]
LIMIT = 5000
for a in sys.argv[1:]:
    if a.startswith("--limit"):
        LIMIT = int(a.split("=", 1)[1]) if "=" in a else LIMIT

PSQL = os.environ.get("PSQL_BIN", "psql")
PG_ENV = {
    **os.environ,
    "PGHOST": os.environ.get("DB_HOST", "localhost"),
    "PGPORT": os.environ.get("DB_PORT", "23799"),
    "PGDATABASE": os.environ.get("DB_NAME", "squid"),
    "PGUSER": os.environ.get("DB_USER", "postgres"),
    "PGPASSWORD": os.environ.get("DB_PASS", "postgres"),
}


def sql(query):
    """Run a query, return list of tuples of strings."""
    out = subprocess.run(
        [PSQL, "-t", "-A", "-F", "\x1f", "-c", query],
        capture_output=True, text=True, env=PG_ENV,
    )
    if out.returncode != 0:
        sys.exit(f"psql failed: {out.stderr.strip()}")
    return [tuple(l.split("\x1f")) for l in out.stdout.strip().splitlines() if l]


def gql(query):
    body = json.dumps({"query": query}).encode()
    req = urllib.request.Request(
        SUBGRAPH_URL, body,
        {"Content-Type": "application/json",
         # the api proxy 403s python's default UA
         "User-Agent": "Mozilla/5.0 (validation script)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        out = json.loads(r.read())
    if "errors" in out:
        sys.exit(f"subgraph error: {out['errors']}")
    return out["data"]


def gql_paginate(entity, fields, where_extra=""):
    rows, last_id = [], ""
    while len(rows) < LIMIT:
        where = f'id_gt: "{last_id}"' + (", " + where_extra if where_extra else "")
        page = gql(
            f'{{ {entity}(first: 1000, orderBy: id, where: {{ {where} }}) '
            f"{{ {fields} }} }}"
        )[entity]
        rows.extend(page)
        if len(page) < 1000:
            break
        last_id = page[-1]["id"]
    return rows


# --- heights ----------------------------------------------------------

squid_rows = sql("select block_number from indexer_status where id = '1'")
if not squid_rows:
    sys.exit("squid has no IndexerStatus row — has the processor run?")
squid_head = int(squid_rows[0][0])
sub_head = int(gql("{ _meta { block { number } } }")["_meta"]["block"]["number"])
cutoff = min(squid_head, sub_head)

print(f"squid head    : {squid_head:,}")
print(f"subgraph head : {sub_head:,}")
print(f"comparing at  : {cutoff:,} (the lower of the two)\n")

failures = 0


def report(name, only_squid, only_sub, matched):
    global failures
    status = "OK " if not only_squid and not only_sub else "DIFF"
    if status == "DIFF":
        failures += 1
    print(f"[{status}] {name}: {matched} matched, "
          f"{len(only_squid)} squid-only, {len(only_sub)} subgraph-only")
    for label, rows in (("squid-only", only_squid), ("subgraph-only", only_sub)):
        for r in list(rows)[:5]:
            print(f"         {label}: {r}")
        if len(rows) > 5:
            print(f"         ... and {len(rows) - 5} more {label}")


def compare(name, squid_set, sub_set):
    report(name, squid_set - sub_set, sub_set - squid_set,
           len(squid_set & sub_set))


# --- 1. FundsMovement -------------------------------------------------
# The subgraph's `token` is null for native rows; normalise both sides.

sq = {
    (tx, cat, (tok or ""), amt, frm, to)
    for tx, cat, tok, amt, frm, to in sql(
        f"""select transaction_hash, category, coalesce(token,''), amount, "from", "to"
            from funds_movement where block_number <= {cutoff} limit {LIMIT}"""
    )
}
sub = {
    (r["transactionHash"], r["category"], (r["token"] or ""), r["amount"],
     r["from"], r["to"])
    for r in gql_paginate(
        "fundsMovements",
        "id transactionHash category token amount from to blockNumber",
        f"blockNumber_lte: {cutoff}",
    )
}
compare("FundsMovement (tx, category, token, amount, from, to)", sq, sub)

# --- 2. BondMovement --------------------------------------------------

sq = {
    (tx, cat, (tok or ""), amt)
    for tx, cat, tok, amt in sql(
        f"""select transaction_hash, category, coalesce(token,''), amount
            from bond_movement where block_number <= {cutoff} limit {LIMIT}"""
    )
}
sub = {
    (r["transactionHash"], r["category"], (r["token"] or ""), r["amount"])
    for r in gql_paginate(
        "bondMovements",
        "id transactionHash category token amount blockNumber",
        f"blockNumber_lte: {cutoff}",
    )
}
compare("BondMovement (tx, category, token, amount)", sq, sub)

# --- 3. MasterSafe ----------------------------------------------------

sq = {
    (i, eoa, floor)
    for i, eoa, floor in sql(
        f"""select id, master_eoa, history_floor_block from master_safe
            where history_floor_block <= {cutoff} limit {LIMIT}"""
    )
}
sub = {
    (r["id"], r["masterEoa"], r["historyFloorBlock"])
    for r in gql_paginate(
        "masterSafes", "id masterEoa historyFloorBlock",
        f"historyFloorBlock_lte: {cutoff}",
    )
}
compare("MasterSafe (id, masterEoa, historyFloorBlock)", sq, sub)

# --- 4. Service -------------------------------------------------------
# The subgraph's Service.id is Bytes(serviceId); the squid's is the decimal
# string. serviceId itself is the stable key.

sq = {
    (sid, agent_ids.strip("{}"))
    for sid, agent_ids in sql(
        f"""select service_id::text, agent_ids::text from service limit {LIMIT}"""
    )
}
sub = {
    (r["serviceId"], ",".join(str(a) for a in r["agentIds"]))
    for r in gql_paginate("services", "id serviceId agentIds")
}
compare("Service (serviceId, agentIds)", sq, sub)

# --- 5. DailyServiceFunds --------------------------------------------
# Only days fully elapsed on both sides; the current day is still moving.

day_cutoff = int(
    gql("{ _meta { block { timestamp } } }")["_meta"]["block"]["timestamp"]
) // 86400 * 86400

sq = {
    (sid, day, claimed)
    for sid, day, claimed in sql(
        f"""select s.service_id::text, d.day_timestamp::text,
                   d.olas_rewards_claimed::text
            from daily_service_funds d join service s on s.id = d.service_id
            where d.day_timestamp < {day_cutoff} limit {LIMIT}"""
    )
}
sub = {
    (r["service"]["serviceId"], r["dayTimestamp"], r["olasRewardsClaimed"])
    for r in gql_paginate(
        "dailyServiceFunds",
        "id service { serviceId } dayTimestamp olasRewardsClaimed",
        f"dayTimestamp_lt: {day_cutoff}",
    )
}
compare("DailyServiceFunds (serviceId, day, olasRewardsClaimed)", sq, sub)

print()
if failures:
    print(f"{failures} section(s) differ — see MIGRATION.md "
          f"'Interpreting known discrepancy classes' before filing a bug.")
    sys.exit(1)
print("all sections match")
