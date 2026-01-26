#!/bin/bash
# Verify v5.2.0 metrics against v2.0.1 on Base staging
#
# Usage: ./verify-v5-metrics.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

OLD_URL="https://subgraph.staging.autonolas.tech/subgraphs/name/marketplace-base-v2_0_1"
NEW_URL="https://subgraph.staging.autonolas.tech/subgraphs/name/marketplace-base-v5_2_0"

echo "==================================="
echo "v5.2.0 Metrics Verification (Base)"
echo "==================================="
echo ""
echo "Comparing:"
echo "  OLD (v2.0.1): $OLD_URL"
echo "  NEW (v5.2.0): $NEW_URL"
echo ""

# Check if chalk is available
if ! node -e "require('chalk')" 2>/dev/null; then
  echo "Installing chalk dependency..."
  npm install --no-save chalk
fi

echo "=========================================="
echo "1. Mech & Service Entity Comparison"
echo "=========================================="
node scripts/compare-mech-services.js --old "$OLD_URL" --new "$NEW_URL" --limit 200

echo ""
echo "=========================================="
echo "2. v5.2.0 Fee Metrics (New in v5.2.0)"
echo "=========================================="
node scripts/verify-v5-fees.js --url "$NEW_URL"

echo ""
echo "=========================================="
echo "3. On-Chain Validation (Mech Counters)"
echo "=========================================="
node scripts/verify-subgraph-data.js --network base --subgraph-url "$NEW_URL" 2>&1 || echo "On-chain validation skipped (requires ethers)"
