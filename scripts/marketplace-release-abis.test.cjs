const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, '../abis', file + '.json'), 'utf8'));
const release = name => read('marketplace-1.2.0/' + name);
const signature = entry => JSON.stringify(entry);
for (const name of ['MechMarketplaceV2', 'MechFixedPriceNative']) {
  test(`${name}: release preserves legacy event layouts and callable interfaces`, () => {
    const current = release(name);
    for (const entry of read(name).filter(e => ['event', 'function'].includes(e.type))) {
      assert(current.some(e => signature(e) === signature(entry)), `${name}: incompatible ${entry.type} ${entry.name}`);
    }
  });
}
test('Marketplace and mech expose legacy, capped and explicit-nonce settlement overloads', () => {
  for (const name of ['MechMarketplaceV2', 'OlasMech', 'MechFixedPriceNative', 'MechFixedPriceTokenUSDC']) {
    const overloads = release(name).filter(e => e.type === 'function' && e.name === 'deliverMarketplaceWithSignatures');
    assert.equal(overloads.length, 3, name);
    const explicit = overloads.find(e => e.inputs.some(i => i.name === 'deadlines'));
    assert(explicit, name);
    assert(explicit.inputs.some(i => i.name === 'nonces' && i.type === 'uint256[]'), name);
    assert(explicit.inputs.some(i => i.name === 'deadlines' && i.type === 'uint256[]'), name);
  }
  const getter = release('MechMarketplaceV2').find(e => e.name === 'getRequestIdWithNonce');
  assert(getter.inputs.some(i => i.name === 'deadline' && i.type === 'uint256'));
  assert(getter.inputs.some(i => i.name === 'nonce' && i.type === 'uint256'));
});
test('replacement USDC factory uses the Token event; historical USDC event is retained separately', () => {
  const events = name => release(name).filter(e => e.type === 'event');
  assert.deepEqual(events('MechFactoryFixedPriceTokenUSDC').map(e => e.name), ['CreateMechFixedPriceToken']);
  assert.deepEqual(events('MechFactoryFixedPriceTokenUSDC')[0], read('MechFactoryFixedPriceToken').find(e => e.type === 'event'));
  assert(read('MechFactoryFixedPriceTokenUSDC').some(e => e.name === 'CreateMechFixedPriceTokenUSDC'));
  assert.deepEqual(events('MechFactoryFixedPriceNative'), read('MechFactoryFixedPriceNative').filter(e => e.type === 'event'));
});
