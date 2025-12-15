import fs from 'fs';

const SUBGRAPH_A = "https://api.subgraph.autonolas.tech/api/proxy/mech";
const SUBGRAPH_B = "https://api.studio.thegraph.com/query/1716136/olas-gnosis-mech-marketplace/version/latest";
const SUBGRAPH_C = "https://subgraph.staging.autonolas.tech/subgraphs/name/marketplace-gnosis-v0_1_1";

const PAGE_SIZE = 1000;

const QUERY = `
query ($skip: Int!) {
  services(first: ${PAGE_SIZE}, skip: $skip, orderBy: totalRequests, orderDirection: desc) {
    id
    totalRequests
    totalDeliveries
  }
}
`;

async function fetchAllServices(url, name) {
  let allServices = [];
  let skip = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      // Note: skip based pagination works but performs poorly for very large datasets and has limits (usually 5000).
      // However, for this check, if we hit the limit, we might need id-based pagination.
      // Let's try to fetch up to 5000-6000 using skip. If it fails or returns error, we stop.
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            query: QUERY,
            variables: { skip: skip }
        }),
      });
      
      if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.errors) {
        console.error(`Errors in ${name} at skip ${skip}:`, data.errors);
        break; 
      }
      
      const services = data.data.services;
      allServices = allServices.concat(services);
      
      if (services.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        skip += PAGE_SIZE;
        if (skip > 5000) {
            console.warn(`${name} reached skip limit of 5000, stopping fetch. Consider ID-based pagination if more data is needed.`);
            hasMore = false;
        }
      }
    }
    return allServices;
  } catch (error) {
    console.error(`Failed to fetch ${name}:`, error.message);
    return allServices;
  }
}

async function validate() {
  console.log("Fetching data from subgraphs...");
  
  const [servicesA, servicesB, servicesC] = await Promise.all([
    fetchAllServices(SUBGRAPH_A, "Subgraph A (Legacy)"),
    fetchAllServices(SUBGRAPH_B, "Subgraph B (Marketplace)"),
    fetchAllServices(SUBGRAPH_C, "Subgraph C (Combined)")
  ]);

  console.log(`Fetched:
  A: ${servicesA.length} services
  B: ${servicesB.length} services
  C: ${servicesC.length} services
  `);

  const mapA = new Map(servicesA.map(s => [s.id, s]));
  const mapB = new Map(servicesB.map(s => [s.id, s]));

  let matchCount = 0;
  let totalServices = servicesC.length;
  let invalidServices = [];

  for (const serviceC of servicesC) {
    const id = serviceC.id;
    const serviceA = mapA.get(id) || { totalRequests: "0", totalDeliveries: "0" };
    const serviceB = mapB.get(id) || { totalRequests: "0", totalDeliveries: "0" };

    const reqA = parseInt(serviceA.totalRequests);
    const reqB = parseInt(serviceB.totalRequests);
    const reqC = parseInt(serviceC.totalRequests);

    const delA = parseInt(serviceA.totalDeliveries);
    const delB = parseInt(serviceB.totalDeliveries);
    const delC = parseInt(serviceC.totalDeliveries);

    const expectedReq = reqA + reqB;
    const expectedDel = delA + delB;

    const isReqValid = checkValidity(expectedReq, reqC);
    const isDelValid = checkValidity(expectedDel, delC);

    if (isReqValid && isDelValid) {
      matchCount++;
    } else {
      invalidServices.push({
        id,
        requests: { A: reqA, B: reqB, Expected: expectedReq, Actual: reqC, Valid: isReqValid },
        deliveries: { A: delA, B: delB, Expected: expectedDel, Actual: delC, Valid: isDelValid }
      });
    }
  }

  console.log("---------------------------------------------------");
  console.log(`Validation Results:`);
  console.log(`Total Services in C: ${totalServices}`);
  console.log(`Matching Services: ${matchCount}`);
  console.log(`Mismatching Services: ${invalidServices.length}`);
  console.log(`Match Rate: ${((matchCount / totalServices) * 100).toFixed(2)}%`);

  if (invalidServices.length > 0) {
    console.log("\nMismatched Services Details (Top 10):");
    invalidServices.slice(0, 10).forEach(s => {
      console.log(`Service ID: ${s.id}`);
      if (!s.requests.Valid) console.log(`  Requests - Expected: ${s.requests.Expected}, Actual: ${s.requests.Actual} (A:${s.requests.A} + B:${s.requests.B})`);
      if (!s.deliveries.Valid) console.log(`  Deliveries - Expected: ${s.deliveries.Expected}, Actual: ${s.deliveries.Actual} (A:${s.deliveries.A} + B:${s.deliveries.B})`);
    });
  }
}

function checkValidity(expected, actual) {
    if (expected === actual) return true;
    if (expected === 0 && actual === 0) return true;
    if (expected === 0 && actual !== 0) return false; 
    
    const diff = Math.abs(expected - actual);
    const errorRate = diff / expected;
    
    // User said > 99% match is fine. So error rate < 1% (0.01)
    return errorRate < 0.01;
}

validate();
