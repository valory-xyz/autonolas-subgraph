import { BigDecimal, BigInt, Bytes, ethereum, log } from "@graphprotocol/graph-ts";
import { DailyPopulationMetric, AgentPortfolioSnapshot, ServiceRegistry, AgentPortfolio } from "../generated/schema";

/**
 * Gets the timestamp for the start of the day (UTC midnight) for a given timestamp
 * @param timestamp The timestamp to get the day timestamp for
 * @returns The timestamp for the start of the day (UTC midnight)
 */
function getDayTimestamp(timestamp: BigInt): BigInt {
  const ONE_DAY = BigInt.fromI32(86400); // 86400 seconds in a day
  return timestamp.div(ONE_DAY).times(ONE_DAY);
}

/**
 * Calculate median value from an array of BigDecimal values
 * @param values Array of BigDecimal values to calculate median from
 * @returns Median value as BigDecimal
 */
export function calculateMedian(values: BigDecimal[]): BigDecimal {
  if (values.length == 0) {
    return BigDecimal.zero();
  }
  
  if (values.length == 1) {
    return values[0];
  }
  
  // Sort values in ascending order
  let sortedValues = values.sort((a, b) => {
    if (a.lt(b)) return -1;
    if (a.gt(b)) return 1;
    return 0;
  });
  
  let length = sortedValues.length;
  let isEven = length % 2 == 0;
  
  if (isEven) {
    // For even number of values, return average of two middle values
    let midIndex1 = length / 2 - 1;
    let midIndex2 = length / 2;
    let sum = sortedValues[midIndex1].plus(sortedValues[midIndex2]);
    return sum.div(BigDecimal.fromString("2"));
  } else {
    // For odd number of values, return middle value
    let midIndex = (length - 1) / 2;
    return sortedValues[midIndex];
  }
}

/**
 * Calculate 7-day simple moving average from historical values
 * @param historicalValues Array of historical daily values (up to 7 days)
 * @returns 7-day SMA as BigDecimal
 */
export function calculate7DaysSMA(historicalValues: BigDecimal[]): BigDecimal {
  if (historicalValues.length == 0) {
    return BigDecimal.zero();
  }
  
  // Add validation for 7-day limit
  if (historicalValues.length > 7) {
    log.error("Historical values array exceeds 7 days: {} days provided", [
      historicalValues.length.toString()
    ]);
    return BigDecimal.zero();
  }
  
  let sum = BigDecimal.zero();
  for (let i = 0; i < historicalValues.length; i++) {
    sum = sum.plus(historicalValues[i]);
  }
  
  let divisor = BigDecimal.fromString(historicalValues.length.toString());
  return sum.div(divisor);
}

/**
 * Get all agent portfolio snapshots for a specific day
 * @param block Current ethereum block
 * @returns Array of AgentPortfolioSnapshot entities for the day
 */
export function getAllAgentSnapshotsForDay(block: ethereum.Block): AgentPortfolioSnapshot[] {
  let snapshots: AgentPortfolioSnapshot[] = [];
  let dayTimestamp = getDayTimestamp(block.timestamp);
  
  // Load all services from the registry
  let registryId = Bytes.fromUTF8("registry");
  let serviceRegistry = ServiceRegistry.load(registryId);
  if (!serviceRegistry) {
    log.warning("ServiceRegistry not found when calculating global metrics", []);
    return snapshots;
  }
  
  // For each service, look for snapshots created on this day
  for (let i = 0; i < serviceRegistry.serviceAddresses.length; i++) {
    let serviceAddress = serviceRegistry.serviceAddresses[i];
    
    // Query all snapshots for this service and filter by day
    // Since we don't know the exact block timestamp, we need to find snapshots within the day
    let portfolio = AgentPortfolio.load(serviceAddress);
    if (portfolio && portfolio.lastSnapshotTimestamp.gt(BigInt.zero())) {
      let snapshotDayTimestamp = getDayTimestamp(portfolio.lastSnapshotTimestamp);
      
      // If the last snapshot was taken on this day, load it
      if (snapshotDayTimestamp.equals(dayTimestamp)) {
        let snapshotId = serviceAddress.toHexString() + "-" + portfolio.lastSnapshotTimestamp.toString();
        let snapshot = AgentPortfolioSnapshot.load(Bytes.fromUTF8(snapshotId));
        
        if (snapshot) {
          snapshots.push(snapshot);
        }
      }
    }
  }
  
  log.info("Found {} agent snapshots for day timestamp {}", [
    snapshots.length.toString(),
    dayTimestamp.toString()
  ]);
  
  return snapshots;
}

/**
 * Get previous DailyPopulationMetric entity to access historical data
 * @param currentDayTimestamp Current day timestamp (UTC midnight)
 * @returns Previous DailyPopulationMetric entity or null if not found
 */
export function getPreviousDailyPopulationMetric(currentDayTimestamp: BigInt): DailyPopulationMetric | null {
  // Calculate previous day timestamp (24 hours ago)
  let previousTimestamp = currentDayTimestamp.minus(BigInt.fromI32(86400)); // 86400 seconds = 24 hours
  let previousGlobalId = previousTimestamp.toString();
  
  return DailyPopulationMetric.load(Bytes.fromUTF8(previousGlobalId));
}

/**
 * Update historical arrays with new median values, maintaining 7-day window
 * @param historicalROI Current historical ROI array
 * @param historicalAPR Current historical APR array
 * @param historicalProjectedROI Current historical projected ROI array
 * @param historicalProjectedAPR Current historical projected APR array
 * @param newMedianROI New median ROI to add
 * @param newMedianAPR New median APR to add
 * @param newMedianProjectedROI New median projected ROI to add
 * @param newMedianProjectedAPR New median projected APR to add
 * @returns Updated historical arrays as tuple [ROI, APR, ProjectedROI, ProjectedAPR]
 */
export function updateHistoricalArrays(
  historicalROI: BigDecimal[],
  historicalAPR: BigDecimal[],
  historicalProjectedROI: BigDecimal[],
  historicalProjectedAPR: BigDecimal[],
  newMedianROI: BigDecimal,
  newMedianAPR: BigDecimal,
  newMedianProjectedROI: BigDecimal,
  newMedianProjectedAPR: BigDecimal
): BigDecimal[][] {
  // Add new values to the end
  historicalROI.push(newMedianROI);
  historicalAPR.push(newMedianAPR);
  historicalProjectedROI.push(newMedianProjectedROI);
  historicalProjectedAPR.push(newMedianProjectedAPR);
  
  // Keep only last 7 days (remove oldest if we have more than 7)
  if (historicalROI.length > 7) {
    historicalROI.shift(); // Remove first element
  }
  if (historicalAPR.length > 7) {
    historicalAPR.shift(); // Remove first element
  }
  if (historicalProjectedROI.length > 7) {
    historicalProjectedROI.shift(); // Remove first element
  }
  if (historicalProjectedAPR.length > 7) {
    historicalProjectedAPR.shift(); // Remove first element
  }
  
  return [historicalROI, historicalAPR, historicalProjectedROI, historicalProjectedAPR];
}

/**
 * Create or update DailyPopulationMetric entity with calculated metrics
 * @param medianROI Calculated median ROI
 * @param medianAPR Calculated median APR
 * @param medianProjectedROI Calculated median projected ROI
 * @param medianProjectedAPR Calculated median projected APR
 * @param sma7dROI Calculated 7-day SMA ROI
 * @param sma7dAPR Calculated 7-day SMA APR
 * @param sma7dProjectedROI Calculated 7-day SMA projected ROI
 * @param sma7dProjectedAPR Calculated 7-day SMA projected APR
 * @param historicalROI Updated historical ROI array
 * @param historicalAPR Updated historical APR array
 * @param historicalProjectedROI Updated historical projected ROI array
 * @param historicalProjectedAPR Updated historical projected APR array
 * @param totalAgents Number of agents included in calculation
 * @param block Current block
 */
export function updateDailyPopulationMetricEntity(
  medianROI: BigDecimal,
  medianAPR: BigDecimal,
  medianProjectedROI: BigDecimal,
  medianProjectedAPR: BigDecimal,
  sma7dROI: BigDecimal,
  sma7dAPR: BigDecimal,
  sma7dProjectedROI: BigDecimal,
  sma7dProjectedAPR: BigDecimal,
  historicalROI: BigDecimal[],
  historicalAPR: BigDecimal[],
  historicalProjectedROI: BigDecimal[],
  historicalProjectedAPR: BigDecimal[],
  totalAgents: number,
  block: ethereum.Block
): void {
  // Use day timestamp (UTC midnight) for entity ID to ensure one entity per day
  let dayTimestamp = getDayTimestamp(block.timestamp);
  let globalId = dayTimestamp.toString();
  
  // Check if entity already exists for this day to prevent duplicates
  let existingEntity = DailyPopulationMetric.load(Bytes.fromUTF8(globalId));
  if (existingEntity != null) {
    log.info("DailyPopulationMetric already exists for day {}, skipping creation", [dayTimestamp.toString()]);
    return;
  }
  
  let dailyPopulationMetric = new DailyPopulationMetric(Bytes.fromUTF8(globalId));
  
  // Set population metrics (actual)
  dailyPopulationMetric.medianPopulationROI = medianROI;
  dailyPopulationMetric.medianPopulationAPR = medianAPR;
  
  // Set population metrics (projected)
  dailyPopulationMetric.medianProjectedROI = medianProjectedROI;
  dailyPopulationMetric.medianProjectedAPR = medianProjectedAPR;
  
  // Set 7-day simple moving averages (actual)
  dailyPopulationMetric.sma7dROI = sma7dROI;
  dailyPopulationMetric.sma7dAPR = sma7dAPR;
  
  // Set 7-day simple moving averages (projected)
  dailyPopulationMetric.sma7dProjectedROI = sma7dProjectedROI;
  dailyPopulationMetric.sma7dProjectedAPR = sma7dProjectedAPR;
  
  // Set metadata
  dailyPopulationMetric.timestamp = dayTimestamp; // Use day timestamp for consistency
  dailyPopulationMetric.block = block.number;
  dailyPopulationMetric.totalAgents = totalAgents as i32;
  
  // Set historical data (actual)
  dailyPopulationMetric.historicalMedianROI = historicalROI;
  dailyPopulationMetric.historicalMedianAPR = historicalAPR;
  
  // Set historical data (projected)
  dailyPopulationMetric.historicalMedianProjectedROI = historicalProjectedROI;
  dailyPopulationMetric.historicalMedianProjectedAPR = historicalProjectedAPR;
  
  dailyPopulationMetric.save();
  
  log.info("Created DailyPopulationMetric entity for day timestamp {} with {} agents, median ROI: {}, median APR: {}, projected ROI: {}, projected APR: {}", [
    dayTimestamp.toString(),
    totalAgents.toString(),
    medianROI.toString(),
    medianAPR.toString(),
    medianProjectedROI.toString(),
    medianProjectedAPR.toString()
  ]);
}

/**
 * Main function to calculate and store population metrics
 * @param block Current ethereum block
 */
export function calculateGlobalMetrics(block: ethereum.Block): void {
  log.info("Starting population metrics calculation for block {} at timestamp {}", [
    block.number.toString(),
    block.timestamp.toString()
  ]);
  
  // Use day timestamp (UTC midnight) for consistent daily entities
  let dayTimestamp = getDayTimestamp(block.timestamp);
  
  // Get all agent snapshots for this day
  let snapshots = getAllAgentSnapshotsForDay(block);
  
  if (snapshots.length == 0) {
    log.warning("No agent snapshots found for population metrics calculation at day timestamp {}", [
      dayTimestamp.toString()
    ]);
    return;
  }
  
  // Extract ROI and APR values from snapshots (both actual and projected)
  let roiValues: BigDecimal[] = [];
  let aprValues: BigDecimal[] = [];
  let projectedRoiValues: BigDecimal[] = [];
  let projectedAprValues: BigDecimal[] = [];
  
  for (let i = 0; i < snapshots.length; i++) {
    roiValues.push(snapshots[i].roi);
    aprValues.push(snapshots[i].apr);
    projectedRoiValues.push(snapshots[i].projectedRoi);
    projectedAprValues.push(snapshots[i].projectedApr);
  }
  
  // Calculate median values (both actual and projected)
  let medianROI = calculateMedian(roiValues);
  let medianAPR = calculateMedian(aprValues);
  let medianProjectedROI = calculateMedian(projectedRoiValues);
  let medianProjectedAPR = calculateMedian(projectedAprValues);
  
  // Get previous DailyPopulationMetric entity for historical data using day timestamp
  let previousDailyPopulationMetric = getPreviousDailyPopulationMetric(dayTimestamp);
  let historicalROI: BigDecimal[] = [];
  let historicalAPR: BigDecimal[] = [];
  let historicalProjectedROI: BigDecimal[] = [];
  let historicalProjectedAPR: BigDecimal[] = [];
  
  if (previousDailyPopulationMetric) {
    historicalROI = previousDailyPopulationMetric.historicalMedianROI;
    historicalAPR = previousDailyPopulationMetric.historicalMedianAPR;
    historicalProjectedROI = previousDailyPopulationMetric.historicalMedianProjectedROI;
    historicalProjectedAPR = previousDailyPopulationMetric.historicalMedianProjectedAPR;
  }
  
  // Update historical arrays with new median values (all 4 metrics)
  let updatedHistorical = updateHistoricalArrays(
    historicalROI, 
    historicalAPR, 
    historicalProjectedROI, 
    historicalProjectedAPR,
    medianROI, 
    medianAPR, 
    medianProjectedROI, 
    medianProjectedAPR
  );
  let updatedHistoricalROI = updatedHistorical[0];
  let updatedHistoricalAPR = updatedHistorical[1];
  let updatedHistoricalProjectedROI = updatedHistorical[2];
  let updatedHistoricalProjectedAPR = updatedHistorical[3];
  
  // Calculate 7-day simple moving averages (all 4 metrics)
  let sma7dROI = calculate7DaysSMA(updatedHistoricalROI);
  let sma7dAPR = calculate7DaysSMA(updatedHistoricalAPR);
  let sma7dProjectedROI = calculate7DaysSMA(updatedHistoricalProjectedROI);
  let sma7dProjectedAPR = calculate7DaysSMA(updatedHistoricalProjectedAPR);
  
  // Create and save DailyPopulationMetric entity (all 14 parameters)
  updateDailyPopulationMetricEntity(
    medianROI,
    medianAPR,
    medianProjectedROI,
    medianProjectedAPR,
    sma7dROI,
    sma7dAPR,
    sma7dProjectedROI,
    sma7dProjectedAPR,
    updatedHistoricalROI,
    updatedHistoricalAPR,
    updatedHistoricalProjectedROI,
    updatedHistoricalProjectedAPR,
    snapshots.length,
    block
  );
  
  log.info("Population metrics calculation completed successfully for day {} - actual: ROI {}, APR {} | projected: ROI {}, APR {}", [
    dayTimestamp.toString(),
    medianROI.toString(),
    medianAPR.toString(),
    medianProjectedROI.toString(),
    medianProjectedAPR.toString()
  ]);
}
