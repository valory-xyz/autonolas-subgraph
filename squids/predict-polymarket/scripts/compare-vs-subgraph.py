#!/usr/bin/env python3
"""Compare the squid's Postgres data against the production subgraph.

The two stores are at different block heights, so only height-independent
data is compared:
  1. DailyProfitStatistic rows for days fully elapsed on BOTH sides
     (day < cutoff). Row ids match across stores: <agent>_<dayTimestamp>.
  2. TraderAgent identity (id -> serviceId).
  3. DepositWallet -> TraderAgent links (factory-derived in the squid vs
     pUSD-heuristic in the subgraph) for DWs created before the cutoff.

Usage:
  python3 scripts/compare-vs-subgraph.py https://subgraph.autonolas.tech/subgraphs/name/<NAME>

Requires: docker (squid Postgres container running). No python deps.
"""
import csv
import io
import json
import subprocess
import sys
import urllib.request

if len(sys.argv) < 2:
    sys.exit("usage: compare-vs-subgraph.py <subgraph-graphql-url>")
SUBGRAPH_URL = sys.argv[1]
PG = ["docker", "exec", "predict-polymarket-squid-db-1",
      "psql", "-U", "postgres", "-d", "squid", "-t", "-A"]

ONE_DAY = 86400


def gql(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
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


def gql_paginate(entity, fields, extra_where=""):
    rows, last_id = [], ""
    while True:
        where = f'id_gt: "{last_id}"' + (", " + extra_where if extra_where else "")
        data = gql(f"""{{ {entity}(first: 1000, orderBy: id, where: {{ {where} }})
                        {{ {fields} }} }}""")[entity]
        rows.extend(data)
        if len(data) < 1000:
            return rows
        last_id = data[-1]["id"]


def sql(query):
    out = subprocess.run(PG + ["-c", query], capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"psql error: {out.stderr}")
    return [line.split("|") for line in out.stdout.strip().split("\n") if line]


# ---- cutoff: last day fully elapsed on both sides -------------------------
meta = gql("{ _meta { block { number timestamp } } }")["_meta"]["block"]
sub_head_ts = meta.get("timestamp")
if sub_head_ts is None:  # some graph-node versions omit timestamp
    sub_head_ts = int(gql("""{ dailyProfitStatistics(first: 1,
        orderBy: date, orderDirection: desc) { date } }""")
        ["dailyProfitStatistics"][0]["date"])
squid_head_ts = int(sql(
    "select coalesce(max(block_timestamp), 0) from market_participant;")[0][0])
cutoff = (min(int(sub_head_ts), squid_head_ts) // ONE_DAY) * ONE_DAY
print(f"subgraph head block {meta['number']}, squid ts {squid_head_ts}")
print(f"comparing full days strictly before {cutoff}\n")

problems = 0

# ---- 1. daily statistics --------------------------------------------------
# the deployed subgraph may run an older schema — compare only fields it has
available = {f["name"] for f in gql(
    '{ __type(name: "DailyProfitStatistic") { fields { name } } }')
    ["__type"]["fields"]}
FIELDS = [f for f in ["totalBets", "totalTraded", "totalPayout",
                      "dailyProfit", "dailyTradedSettled"] if f in available]
print(f"comparing daily fields: {', '.join(FIELDS)}")
sub_days = {r["id"]: r for r in gql_paginate(
    "dailyProfitStatistics",
    "id date " + " ".join(FIELDS), f"date_lt: {cutoff}")}
SQL_COLS = {"totalBets": "total_bets", "totalTraded": "total_traded",
            "totalPayout": "total_payout", "dailyProfit": "daily_profit",
            "dailyTradedSettled": "daily_traded_settled"}
squid_days = {r[0]: dict(zip(FIELDS, r[1:])) for r in sql(
    f"select id, {', '.join(SQL_COLS[f] for f in FIELDS)}"
    f" from daily_profit_statistic where date < {cutoff};")}

only_sub = sub_days.keys() - squid_days.keys()
only_squid = squid_days.keys() - sub_days.keys()
diff = []
for k in sub_days.keys() & squid_days.keys():
    for f in FIELDS:
        if str(sub_days[k][f]) != str(squid_days[k][f]):
            diff.append((k, f, sub_days[k][f], squid_days[k][f]))
print(f"daily stats: subgraph {len(sub_days)} rows, squid {len(squid_days)} rows")
print(f"  only in subgraph: {len(only_sub)}  only in squid: {len(only_squid)}"
      f"  field mismatches: {len(diff)}")
for k in sorted(only_sub)[:5]:
    print(f"    sub-only  {k}")
for k in sorted(only_squid)[:5]:
    print(f"    squid-only {k}")
for k, f, a, b in diff[:10]:
    print(f"    {k} {f}: subgraph={a} squid={b}")
problems += len(only_sub) + len(only_squid) + len(diff)

# ---- 2. trader agents -----------------------------------------------------
sub_agents = {r["id"]: str(int(r["serviceId"]))
              for r in gql_paginate("traderAgents", "id serviceId",
                                    f"blockTimestamp_lt: {cutoff}")}
squid_agents = {r[0]: r[1] for r in sql(
    f"select id, service_id from trader_agent where block_timestamp < {cutoff};")}
a_only_sub = sub_agents.keys() - squid_agents.keys()
a_only_squid = squid_agents.keys() - sub_agents.keys()
a_diff = [k for k in sub_agents.keys() & squid_agents.keys()
          if sub_agents[k] != squid_agents[k]]
print(f"\ntrader agents: subgraph {len(sub_agents)}, squid {len(squid_agents)}")
print(f"  only in subgraph: {len(a_only_sub)}  only in squid: {len(a_only_squid)}"
      f"  serviceId mismatches: {len(a_diff)}")
for k in sorted(a_only_sub | a_only_squid)[:10]:
    side = "sub-only" if k in a_only_sub else "squid-only"
    print(f"    {side} {k}")
problems += len(a_only_sub) + len(a_only_squid) + len(a_diff)

# ---- 3. deposit wallet links (factory vs pUSD heuristic) ------------------
query_fields = {f["name"] for f in gql(
    '{ __type(name: "Query") { fields { name } } }')["__type"]["fields"]}
if "depositWallets" not in query_fields:
    print("\ndeposit wallets: SKIPPED — deployed subgraph schema has no "
          "DepositWallet entity (older deployment?)")
    print(f"\n{'=' * 50}")
    print("RESULT: MATCH" if problems == 0
          else f"RESULT: {problems} discrepancies")
    sys.exit(0)
sub_dws = {r["id"]: r["traderAgent"]["id"] for r in gql_paginate(
    "depositWallets", "id traderAgent { id }",
    f"blockTimestamp_lt: {cutoff}")}
squid_dws = {r[0]: r[1] for r in sql(
    "select id, trader_agent_id from deposit_wallet"
    f" where block_timestamp < {cutoff};")}
d_only_sub = sub_dws.keys() - squid_dws.keys()
d_only_squid = squid_dws.keys() - sub_dws.keys()
d_diff = [k for k in sub_dws.keys() & squid_dws.keys()
          if sub_dws[k] != squid_dws[k]]
print(f"\ndeposit wallets (< cutoff): subgraph {len(sub_dws)}, squid {len(squid_dws)}")
print(f"  only in subgraph: {len(d_only_sub)}  only in squid: {len(d_only_squid)}"
      f"  WRONG AGENT LINKS: {len(d_diff)}")
for k in d_diff[:10]:
    print(f"    {k}: subgraph->{sub_dws[k]} squid->{squid_dws[k]}")
problems += len(d_diff)  # only-in-one-side is expected: different methods/heights

print(f"\n{'=' * 50}")
print("RESULT: MATCH" if problems == 0 else f"RESULT: {problems} discrepancies")
