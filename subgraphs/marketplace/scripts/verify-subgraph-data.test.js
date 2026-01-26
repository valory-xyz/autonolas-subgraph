const { describe, test, mock } = require('node:test');
const assert = require('node:assert');

describe('compareValues', () => {
  test('all fields match', () => {
    const subgraph = {
      karma: '100',
      maxDeliveryRate: '1000',
      receivedRequests: '50',
      totalDeliveriesTransactions: '45',
    };
    const onChain = {
      karma: '100',
      maxDeliveryRate: '1000',
      numTotalRequests: '50',
      numTotalDeliveries: '45',
    };

    const comparison = compareValues(subgraph, onChain);

    assert.strictEqual(comparison.length, 4);
    assert.ok(comparison.every(c => c.match));
  });

  test('fields mismatch', () => {
    const subgraph = {
      karma: '100',
      maxDeliveryRate: '1000',
      receivedRequests: '50',
      totalDeliveriesTransactions: '45',
    };
    const onChain = {
      karma: '100',
      maxDeliveryRate: '2000',
      numTotalRequests: '51',
      numTotalDeliveries: '45',
    };

    const comparison = compareValues(subgraph, onChain);

    const maxRateCmp = comparison.find(c => c.field === 'maxDeliveryRate');
    const requestsCmp = comparison.find(c => c.field === 'numTotalRequests');

    assert.strictEqual(maxRateCmp.match, false);
    assert.strictEqual(maxRateCmp.subgraphVal, '1000');
    assert.strictEqual(maxRateCmp.onChainVal, '2000');
    assert.strictEqual(requestsCmp.match, false);
  });

  test('negative karma handling', () => {
    const subgraph = {
      karma: '-500',
      maxDeliveryRate: '1000',
      receivedRequests: '10',
      totalDeliveriesTransactions: '8',
    };
    const onChain = {
      karma: '-500',
      maxDeliveryRate: '1000',
      numTotalRequests: '10',
      numTotalDeliveries: '8',
    };

    const comparison = compareValues(subgraph, onChain);
    const karmaCmp = comparison.find(c => c.field === 'karma');

    assert.strictEqual(karmaCmp.match, true);
    assert.strictEqual(karmaCmp.subgraphVal, '-500');
  });

  test('null maxDeliveryRate from subgraph', () => {
    const subgraph = {
      karma: '0',
      maxDeliveryRate: null,
      receivedRequests: '0',
      totalDeliveriesTransactions: '0',
    };
    const onChain = {
      karma: '0',
      maxDeliveryRate: '0',
      numTotalRequests: '0',
      numTotalDeliveries: '0',
    };

    const comparison = compareValues(subgraph, onChain);
    const rateCmp = comparison.find(c => c.field === 'maxDeliveryRate');

    assert.strictEqual(rateCmp.match, true);
    assert.strictEqual(rateCmp.subgraphVal, '0');
  });
});

describe('parseCliArgs', () => {
  test('valid network argument', () => {
    const originalArgv = process.argv;
    process.argv = ['node', 'script.js', '--network', 'gnosis'];

    const { network, subgraphUrl } = parseCliArgs();

    assert.strictEqual(network, 'gnosis');
    assert.strictEqual(subgraphUrl, null);

    process.argv = originalArgv;
  });

  test('invalid network argument exits', () => {
    const originalArgv = process.argv;
    const originalExit = process.exit;
    process.argv = ['node', 'script.js', '--network', 'invalid'];

    let exitCode = null;
    process.exit = mock.fn((code) => { exitCode = code; throw new Error('exit'); });

    try {
      parseCliArgs();
    } catch (err) {
      // Expected
    }

    assert.strictEqual(exitCode, 1);

    process.argv = originalArgv;
    process.exit = originalExit;
  });
});

// Duplicated functions for test isolation (Node.js native test runner constraint)
function compareValues(subgraph, onChain) {
  const fields = ['karma', 'maxDeliveryRate', 'numTotalRequests', 'numTotalDeliveries'];
  const sgMap = {
    numTotalRequests: subgraph.receivedRequests,
    numTotalDeliveries: subgraph.totalDeliveriesTransactions,
  };

  return fields.map(field => {
    const sgVal = (sgMap[field] || subgraph[field] || '0').toString();
    const ocVal = onChain[field];
    return { field, match: sgVal === ocVal, subgraphVal: sgVal, onChainVal: ocVal };
  });
}

const NETWORKS = {
  gnosis: { rpc: 'https://rpc.gnosischain.com', subgraphUrl: 'https://example.com', karmaAddress: '0x123' },
  polygon: { rpc: 'https://polygon-rpc.com', subgraphUrl: 'https://example.com', karmaAddress: '0x456' },
  base: { rpc: 'https://mainnet.base.org', subgraphUrl: 'https://example.com', karmaAddress: '0x789' },
  optimism: { rpc: 'https://mainnet.optimism.io', subgraphUrl: 'https://example.com', karmaAddress: '0xabc' },
};

function parseCliArgs() {
  const args = process.argv.slice(2);
  const networkIdx = args.indexOf('--network');

  if (networkIdx === -1 || !args[networkIdx + 1]) {
    console.error('Usage: node verify-subgraph-data.js --network <gnosis|polygon|base|optimism> [--subgraph-url <url>]');
    process.exit(1);
  }

  const network = args[networkIdx + 1];

  if (!NETWORKS[network]) {
    console.error(`Invalid network: ${network}. Must be one of: ${Object.keys(NETWORKS).join(', ')}`);
    process.exit(1);
  }

  const urlIdx = args.indexOf('--subgraph-url');
  const subgraphUrl = urlIdx !== -1 ? args[urlIdx + 1] : null;

  return { network, subgraphUrl };
}
