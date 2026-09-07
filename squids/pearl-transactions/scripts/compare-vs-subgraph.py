#!/usr/bin/env python3
"""Compare the pearl-transactions squid's Postgres against a deployed subgraph.

The two stores use different ID schemes — the subgraph concatenates Bytes,
the squid joins strings — so NOTHING is compared by row id. Every section
matches on semantic keys, and those keys include the relation fields
(masterSafe / service / agentSafe), because a row with the right amount and
the wrong links is exactly the failure mode the wallet notices: Pearl
queries `where: { masterSafe }`, so a NULL link silently removes the row
from a user's history.

Both sides are restricted to the SAME block window, ordered, rather than
"first N rows". Comparing `LIMIT 5000` on one side against the first 5000
by id on the other reports thousands of spurious differences as soon as
either table exceeds the limit.

Sections:
  1. FundsMovement  — (txHash, category, token, amount, from, to,
                       masterSafe, service, agentSafe)
  2. BondMovement   — (txHash, category, token, amount, bondType,
                       service, agentSafe)
  3. MasterSafe     — (id, masterEoa, historyFloorBlock)
  4. Service        — (serviceId, agentIds)
  5. DailyServiceFunds for days fully elapsed on both sides

Usage:
  python3 scripts/compare-vs-subgraph.py <subgraph-graphql-url> [--window N]

  # Base runs the same v2 schema and is at chain head, so it is the only
  # usable end-to-end baseline today (there is no deployed Polygon
  # endpoint — see MIGRATION.md). Point the squid at Base first:
  python3 scripts/compare-vs-subgraph.py https://transactions-base.subgraph.autonolas.tech

--window is how many blocks back from the comparison height to diff
(default 500,000). Widen it for more coverage, narrow it if the subgraph
endpoint is slow.

Connects to Postgres via psql using the same DB_* env vars the squid uses.
No python dependencies.
"""
import json
import os
import subprocess
import sys
import urllib.request

args = [a for a in sys.argv[1:] if not a.startswith("--")]
if not args:
    sys.exit(__doc__)
SUBGRAPH_URL = args[0]

WINDOW = 500_000
for a in sys.argv[1:]:
    if a.startswith("--window"):
        WINDOW = int(a.split("=", 1)[1]) if "=" in a else WINDOW

PAGE = 1000
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
    """Page by id — stable, and unbounded so the window is the only filter."""
    rows, last_id = [], ""
    while True:
        where = f'id_gt: "{last_id}"' + (", " + where_extra if where_extra else "")
        page = gql(
            f"{{ {entity}(first: {PAGE}, orderBy: id, where: {{ {where} }}) "
            f"{{ {fields} }} }}"
        )[entity]
        rows.extend(page)
        if len(page) < PAGE:
            return rows
        last_id = page[-1]["id"]


def norm(v):
    """Empty string for every flavour of absent, so the two stores agree."""
    return "" if v is None else str(v)


def rel(obj, key="id"):
    return "" if obj is None else str(obj[key])


# --- heights ----------------------------------------------------------

squid_rows = sql("select block_number from indexer_status where id = '1'")
if not squid_rows:
    sys.exit("squid has no IndexerStatus row — has the processor run?")
squid_head = int(squid_rows[0][0])
sub_head = int(gql("{ _meta { block { number } } }")["_meta"]["block"]["number"])
cutoff = min(squid_head, sub_head)
floor = max(0, cutoff - WINDOW)

print(f"squid head    : {squid_head:,}")
print(f"subgraph head : {sub_head:,}")
print(f"window        : {floor:,} .. {cutoff:,}  ({WINDOW:,} blocks)\n")

failures = 0


def compare(name, squid_set, sub_set):
    global failures
    only_squid = squid_set - sub_set
    only_sub = sub_set - squid_set
    if only_squid or only_sub:
        failures += 1
        status = "DIFF"
    else:
        status = "OK "
    print(f"[{status}] {name}: {len(squid_set & sub_set)} matched, "
          f"{len(only_squid)} squid-only, {len(only_sub)} subgraph-only")
    for label, rows in (("squid-only", only_squid), ("subgraph-only", only_sub)):
        for r in list(rows)[:5]:
            print(f"         {label}: {r}")
        if len(rows) > 5:
            print(f"         ... and {len(rows) - 5} more {label}")


# --- 1. FundsMovement -------------------------------------------------
# Relation fields are part of the key: the wallet filters on masterSafe, so
# a row whose link is NULL is invisible to it even though its amount is
# right. Subgraph Service.id is Bytes(serviceId) and the squid's is the
# decimal string, so `service` is compared via serviceId on both sides.

sq = {
    (tx, cat, norm(tok), amt, frm, to, norm(ms), norm(svc), norm(ags))
    for tx, cat, tok, amt, frm, to, ms, svc, ags in sql(
        f"""select f.transaction_hash, f.category, coalesce(f.token,''),
                   f.amount::text, f."from", f."to",
                   coalesce(f.master_safe_id,''),
                   coalesce(s.service_id::text,''),
                   coalesce(f.agent_safe_id,'')
            from funds_movement f
            left join service s on s.id = f.service_id
            where f.block_number between {floor} and {cutoff}
            order by f.block_number, f.id"""
    )
}
sub = {
    (r["transactionHash"], r["category"], norm(r["token"]), r["amount"],
     r["from"], r["to"], rel(r["masterSafe"]),
     rel(r["service"], "serviceId"), rel(r["agentSafe"]))
    for r in gql_paginate(
        "fundsMovements",
        "id transactionHash category token amount from to blockNumber "
        "masterSafe { id } service { serviceId } agentSafe { id }",
        f"blockNumber_gte: {floor}, blockNumber_lte: {cutoff}",
    )
}
compare("FundsMovement (+ masterSafe/service/agentSafe)", sq, sub)

# --- 2. BondMovement --------------------------------------------------

sq = {
    (tx, cat, norm(tok), amt, norm(bt), norm(svc), norm(ags))
    for tx, cat, tok, amt, bt, svc, ags in sql(
        f"""select b.transaction_hash, b.category, coalesce(b.token,''),
                   b.amount::text, coalesce(b.bond_type,''),
                   coalesce(s.service_id::text,''),
                   coalesce(b.agent_safe_id,'')
            from bond_movement b
            left join service s on s.id = b.service_id
            where b.block_number between {floor} and {cutoff}
            order by b.block_number, b.id"""
    )
}
sub = {
    (r["transactionHash"], r["category"], norm(r["token"]), r["amount"],
     norm(r["bondType"]), rel(r["service"], "serviceId"), rel(r["agentSafe"]))
    for r in gql_paginate(
        "bondMovements",
        "id transactionHash category token amount bondType blockNumber "
        "service { serviceId } agentSafe { id }",
        f"blockNumber_gte: {floor}, blockNumber_lte: {cutoff}",
    )
}
compare("BondMovement (+ bondType/service/agentSafe)", sq, sub)

# --- 3. MasterSafe ----------------------------------------------------

sq = {
    (i, eoa, blk)
    for i, eoa, blk in sql(
        f"""select id, master_eoa, history_floor_block::text from master_safe
            where history_floor_block between {floor} and {cutoff}
            order by history_floor_block, id"""
    )
}
sub = {
    (r["id"], r["masterEoa"], r["historyFloorBlock"])
    for r in gql_paginate(
        "masterSafes", "id masterEoa historyFloorBlock",
        f"historyFloorBlock_gte: {floor}, historyFloorBlock_lte: {cutoff}",
    )
}
compare("MasterSafe (id, masterEoa, historyFloorBlock)", sq, sub)

# --- 4. Service -------------------------------------------------------
# No block column to window on; services are few enough to compare whole.

sq = {
    (sid, agent_ids.strip("{}"))
    for sid, agent_ids in sql(
        "select service_id::text, agent_ids::text from service order by service_id"
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
            where d.day_timestamp < {day_cutoff}
            order by d.day_timestamp, s.service_id"""
    )
}
sub = {
    (r["service"]["serviceId"], r["dayTimestamp"], r["olasRewardsClaimed"])
    for r in gql_paginate(
        # The Graph appends _collection when an entity's singular and plural
        # names collide, as they do for DailyServiceFunds. Verified against
        # the live Base deployment.
        "dailyServiceFunds_collection",
        "id service { serviceId } dayTimestamp olasRewardsClaimed",
        f"dayTimestamp_lt: {day_cutoff}",
    )
}
compare("DailyServiceFunds (serviceId, day, olasRewardsClaimed)", sq, sub)

print()
if failures:
    print(f"{failures} section(s) differ — see MIGRATION.md "
          f"'Deliberate differences from the subgraph' before filing a bug.")
    sys.exit(1)
print("all sections match")
