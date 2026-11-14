// ABI-only compilation; no deployment, credentials or RPC required.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const [sourceRoot, toolsRoot] = process.argv.slice(2);
if (!sourceRoot || !toolsRoot) throw new Error('Usage: node scripts/generate-marketplace-release-abis.cjs <contract-checkout> <compiler-package-directory>');
const revision = '64d8dba33e60860644bdda6f57ffc98057fa27e7';
const git = (...args) => execFileSync('git', ['-C', sourceRoot, ...args], {encoding: 'utf8'}).trim();
if (git('rev-parse', 'HEAD') !== revision || git('status', '--porcelain', '--untracked-files=no')) throw new Error('Expected clean pinned contract checkout (including initialized submodules)');
const solc = require(path.resolve(toolsRoot, 'node_modules/solc'));
if (!solc.version().startsWith('0.8.30+commit.73712a01')) throw new Error('Expected solc 0.8.30');
for (const [name, version] of Object.entries({'@openzeppelin/contracts': '4.9.6', '@gnosis.pm/safe-contracts': '1.3.0', '@account-abstraction/contracts': '0.5.0'})) {
  if (require(path.resolve(toolsRoot, 'node_modules', name, 'package.json')).version !== version) throw new Error(`Expected ${name}@${version}`);
}
if (git('rev-parse', 'HEAD:lib/gnosis-mech') !== execFileSync('git', ['-C', path.join(sourceRoot, 'lib/gnosis-mech'), 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim()) throw new Error('gnosis-mech must match the pinned submodule');
const targets = {
  MechMarketplaceV2: ['contracts/MechMarketplace.sol', 'MechMarketplace'],
  OlasMech: ['contracts/OlasMech.sol', 'OlasMech'],
  MechFixedPriceNative: ['contracts/mechs/native/MechFixedPriceNative.sol', 'MechFixedPriceNative'],
  MechFixedPriceTokenUSDC: ['contracts/mechs/token/usdc/MechFixedPriceTokenUSDC.sol', 'MechFixedPriceTokenUSDC'],
  MechFactoryFixedPriceNative: ['contracts/mechs/native/MechFactoryFixedPriceNative.sol', 'MechFactoryFixedPriceNative'],
  MechFactoryFixedPriceTokenUSDC: ['contracts/mechs/token/usdc/MechFactoryFixedPriceTokenUSDC.sol', 'MechFactoryFixedPriceTokenUSDC'],
};
const input = {language: 'Solidity', sources: Object.fromEntries(Object.values(targets).map(([file]) => [file, {content: fs.readFileSync(path.join(sourceRoot, file), 'utf8')}])), settings: {optimizer: {enabled: true, runs: 1000000}, evmVersion: 'prague', outputSelection: {'*': {'*': ['abi']}}}};
const output = JSON.parse(solc.compile(JSON.stringify(input), {import: file => {
  for (const root of [sourceRoot, path.join(toolsRoot, 'node_modules')]) {
    const candidate = path.join(root, file);
    if (fs.existsSync(candidate)) return {contents: fs.readFileSync(candidate, 'utf8')};
  }
  return {error: `Import not found: ${file}`};
}}));
const errors = (output.errors || []).filter(e => e.severity === 'error');
if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
const destination = path.resolve(__dirname, '../abis/marketplace-1.2.0');
fs.mkdirSync(destination, {recursive: true});
for (const [name, [file, contract]] of Object.entries(targets)) {
  fs.writeFileSync(path.join(destination, name + '.json'), JSON.stringify(output.contracts[file][contract].abi, null, 2) + '\n');
}
console.log(`Generated ${Object.keys(targets).length} ABIs with ${solc.version()} from ${revision}`);
