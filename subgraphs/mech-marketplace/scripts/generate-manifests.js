const fs = require('fs');

const networksData = JSON.parse(fs.readFileSync('networks.json', 'utf8'));

function replacePlaceholders(template, network, networkData) {
  let result = template.replace(/{{ network }}/g, network);
  
  // Remove Gnosis-only sections for non-Gnosis networks
  if (network !== 'gnosis') {
    const lines = result.split('\n');
    const filteredLines = [];
    let skipSection = false;
    
    for (const line of lines) {
      if (line.trim() === '# Gnosis only sources - start') {
        skipSection = true;
        continue;
      }
      
      if (line.trim() === '# Gnosis only sources - end') {
        skipSection = false;
        continue;
      }
      
      if (!skipSection) {
        filteredLines.push(line);
      }
    }
    
    result = filteredLines.join('\n');
  }
  
  for (const [contractName, contractData] of Object.entries(networkData)) {
    result = result.replace(new RegExp(`{{ ${contractName}\\.address }}`, 'g'), contractData.address);
    result = result.replace(new RegExp(`{{ ${contractName}\\.startBlock }}`, 'g'), contractData.startBlock.toString());
    result = result.replace(new RegExp(`{{ ${contractName}\\.endBlock }}`, 'g'), contractData.endBlock?.toString());
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