const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const root = path.resolve(__dirname, '..');
const signature = (event) => event.replace(/\bindexed\s*/g, '').replace(/\s/g, '');
const sources = (manifest) => manifest.dataSources.filter((s) => s.name.startsWith('MechMarketplace'));
function overlaps(manifest) {
  const result = [];
  const entries = sources(manifest);
  for (let i = 0; i < entries.length; i++) {
    for (const b of entries.slice(i + 1)) {
      const a = entries[i];
      if (a.source.address.toLowerCase() !== b.source.address.toLowerCase()) continue;
      if (Math.max(a.source.startBlock, b.source.startBlock) > Math.min(a.source.endBlock ?? Infinity, b.source.endBlock ?? Infinity)) continue;
      const events = new Set(a.mapping.eventHandlers.map((h) => signature(h.event)));
      for (const h of b.mapping.eventHandlers) {
        if (events.has(signature(h.event))) result.push(`${a.name}/${b.name}: ${signature(h.event)}`);
      }
    }
  }
  return result;
}
const read = (chain) => yaml.load(fs.readFileSync(path.join(root, `subgraph.${chain}.yaml`), 'utf8'));
for (const chain of ['gnosis', 'base', 'polygon', 'optimism', 'mainnet', 'arbitrum', 'celo']) {
  test(`${chain}: no overlapping subscriptions for the same marketplace event`, () => {
    assert.deepEqual(overlaps(read(chain)), []);
  });
}
for (const [chain, start] of Object.entries({polygon: 81028558, optimism: 145788454, mainnet: 24427441, arbitrum: 430646886, celo: 58841368})) {
  test(`${chain}: V2 covers the original deployment with all five handlers`, () => {
    const entries = sources(read(chain));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, 'MechMarketplaceV2');
    assert.equal(entries[0].source.startBlock, start);
    assert.equal(entries[0].source.endBlock, undefined);
    assert.deepEqual(entries[0].mapping.eventHandlers.map((h) => h.handler).sort(), [
      'handleCreateMech', 'handleMarketplaceDelivery', 'handleMarketplaceDeliveryWithSignatures',
      'handleMarketplaceRequest', 'handleDeliverWithSignaturesV2',
    ].sort());
  });
}
for (const [chain, boundary] of [['gnosis', 41490893], ['base', 33907400]]) {
  test(`${chain}: historical V1/V2 boundary is retained without a gap`, () => {
    const entries = sources(read(chain));
    assert.equal(entries.length, 2);
    assert.equal(entries.find((s) => s.name === 'MechMarketplaceV1').source.endBlock, boundary);
    assert.equal(entries.find((s) => s.name === 'MechMarketplaceV2').source.startBlock, boundary + 1);
  });
}
test('coverage check detects the original overlapping V1/V2 registrations', () => {
  const manifest = read('base');
  const [v1, v2] = sources(manifest);
  delete v1.source.endBlock;
  v2.source.startBlock = v1.source.startBlock;
  const conflicts = overlaps(manifest);
  assert(conflicts.some((x) => x.includes('MarketplaceDeliveryWithSignatures(')));
  assert(conflicts.some((x) => x.includes('CreateMech(')));
  // Indexed-ness does not change topic0.
  assert(conflicts.some((x) => x.includes('MarketplaceDelivery(')));
});
