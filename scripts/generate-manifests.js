const fs = require('fs');

const networksData = JSON.parse(fs.readFileSync('networks.json', 'utf8'));

function replacePlaceholders(template, network, networkData) {
  let result = template.replace(/{{ network }}/g, network);
  
  for (const [contractName, contractData] of Object.entries(networkData)) {
    result = result.replace(new RegExp(`{{ ${contractName}\\.address }}`, 'g'), contractData.address);
    result = result.replace(new RegExp(`{{ ${contractName}\\.startBlock }}`, 'g'), contractData.startBlock.toString());
  }
  
  return result;
}

const template = fs.readFileSync('subgraph.template.yaml', 'utf8');;

Object.entries(networksData).forEach(([network, networkData]) => {
  const config = replacePlaceholders(template, network, networkData);
  const outputPath = `subgraph.${network}.yaml`;
  fs.writeFileSync(outputPath, config);
  console.log(`Generated ${outputPath}`);
});