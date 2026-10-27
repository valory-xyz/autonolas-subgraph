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
  const entries = manifest.dataSources.filter((s) => typeof s.source?.address === 'string');
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
  test(`${chain}: every mech template subscribes to advertised-maximum updates`, () => {
    const manifest = read(chain);
    const mechTemplates = manifest.templates.filter((t) => t.kind === 'ethereum');
    assert(mechTemplates.length > 0);
    for (const template of mechTemplates) {
      assert(
        template.mapping.eventHandlers.some(
          (h) => h.event === 'MaxDeliveryRateUpdated(uint256)' && h.handler === 'handleMaxDeliveryRateUpdated'
        ),
        `${chain}/${template.name} is missing MaxDeliveryRateUpdated`
      );
    }
  });
}
const v2Starts = {
  gnosis: 41490894,
  base: 33907401,
  polygon: 81028558,
  optimism: 145788454,
  mainnet: 24427441,
  arbitrum: 430646886,
  celo: 58841368,
};
const expectedV2Handlers = [
  'handleCreateMech', 'handleMarketplaceDelivery', 'handleMarketplaceDeliveryWithSignatures',
  'handleMarketplaceRequest', 'handleDeliverWithSignaturesV2',
].sort();
const expectedV1Handlers = [
  'handleCreateMech', 'handleMarketplaceDelivery', 'handleMarketplaceDeliveryWithSignatures',
  'handleMarketplaceRequest', 'handleDeliverWithSignaturesV1',
].sort();

for (const [chain, start] of Object.entries(v2Starts)) {
  test(`${chain}: V2 covers its deployment block with all five handlers`, () => {
    const entries = sources(read(chain));
    const v2 = entries.find((s) => s.name === 'MechMarketplaceV2');
    assert(v2, `${chain} has no MechMarketplaceV2 source`);
    assert.equal(v2.source.startBlock, start);
    assert.equal(v2.source.endBlock, undefined);
    assert.deepEqual(v2.mapping.eventHandlers.map((h) => h.handler).sort(), expectedV2Handlers);
  });
}
for (const [chain, boundary] of [['gnosis', 41490893], ['base', 33907400]]) {
  test(`${chain}: historical V1/V2 boundary is retained without a gap`, () => {
    const entries = sources(read(chain));
    assert.equal(entries.length, 2);
    const v1 = entries.find((s) => s.name === 'MechMarketplaceV1');
    const v2 = entries.find((s) => s.name === 'MechMarketplaceV2');
    assert.equal(v1.source.endBlock, boundary);
    assert.equal(v2.source.startBlock, boundary + 1);
    assert.deepEqual(v1.mapping.eventHandlers.map((h) => h.handler).sort(), expectedV1Handlers);
  });
}
test('coverage check detects the original overlapping V1/V2 registrations', () => {
  const manifest = read('base');
  const [v1, v2] = sources(manifest);
  delete v1.source.endBlock;
  v2.source.startBlock = v1.source.startBlock;
  const alias = JSON.parse(JSON.stringify(v2));
  alias.name = 'AlternateMarketplaceRegistration';
  manifest.dataSources.push(alias);
  const conflicts = overlaps(manifest);
  assert(conflicts.some((x) => x.includes('MarketplaceDeliveryWithSignatures(')));
  assert(conflicts.some((x) => x.includes('CreateMech(')));
  assert(conflicts.some((x) => x.includes('AlternateMarketplaceRegistration')));
  // Indexed-ness does not change topic0.
  assert(conflicts.some((x) => x.includes('MarketplaceDelivery(')));
});
