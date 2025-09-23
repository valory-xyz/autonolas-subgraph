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
 * Check if an agent should be excluded from projected ROI calculations
 * Excludes agents with initial value < $1.00 AND final value exactly $0.00
 * @param snapshot AgentPortfolioSnapshot to check
 * @returns True if agent should be excluded from projected ROI calculations
 */
function shouldExcludeFromProjectedROI(snapshot: AgentPortfolioSnapshot): boolean {
  const lowInitialValue = snapshot.initialValue.lt(BigDecimal.fromString("1.0"));
  const zeroFinalValue = snapshot.finalValue.equals(BigDecimal.zero());
  
  return lowInitialValue && zeroFinalValue;
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
 * @param historicalEthAdjustedROI Current historical ETH-adjusted ROI array
 * @param historicalEthAdjustedAPR Current historical ETH-adjusted APR array
 * @param historicalEthAdjustedProjectedROI Current historical ETH-adjusted projected ROI array
 * @param historicalEthAdjustedProjectedAPR Current historical ETH-adjusted projected APR array
 * @param newMedianROI New median ROI to add
 * @param newMedianAPR New median APR to add
 * @param newMedianProjectedROI New median projected ROI to add
 * @param newMedianProjectedAPR New median projected APR to add
 * @param newMedianEthAdjustedROI New median ETH-adjusted ROI to add
 * @param newMedianEthAdjustedAPR New median ETH-adjusted APR to add
 * @param newMedianEthAdjustedProjectedROI New median ETH-adjusted projected ROI to add
 * @param newMedianEthAdjustedProjectedAPR New median ETH-adjusted projected APR to add
 * @returns Updated historical arrays as tuple [ROI, APR, ProjectedROI, ProjectedAPR, EthAdjustedROI, EthAdjustedAPR, EthAdjustedProjectedROI, EthAdjustedProjectedAPR]
 */
export function updateHistoricalArrays(
  historicalROI: BigDecimal[],
  historicalAPR: BigDecimal[],
  historicalProjectedROI: BigDecimal[],
  historicalProjectedAPR: BigDecimal[],
  historicalEthAdjustedROI: BigDecimal[],
  historicalEthAdjustedAPR: BigDecimal[],
  historicalEthAdjustedProjectedROI: BigDecimal[],
  historicalEthAdjustedProjectedAPR: BigDecimal[],
  newMedianROI: BigDecimal,
  newMedianAPR: BigDecimal,
  newMedianProjectedROI: BigDecimal,
  newMedianProjectedAPR: BigDecimal,
  newMedianEthAdjustedROI: BigDecimal,
  newMedianEthAdjustedAPR: BigDecimal,
  newMedianEthAdjustedProjectedROI: BigDecimal,
  newMedianEthAdjustedProjectedAPR: BigDecimal
): BigDecimal[][] {
  // Add new values to the end
  historicalROI.push(newMedianROI);
  historicalAPR.push(newMedianAPR);
  historicalProjectedROI.push(newMedianProjectedROI);
  historicalProjectedAPR.push(newMedianProjectedAPR);
  historicalEthAdjustedROI.push(newMedianEthAdjustedROI);
  historicalEthAdjustedAPR.push(newMedianEthAdjustedAPR);
  historicalEthAdjustedProjectedROI.push(newMedianEthAdjustedProjectedROI);
  historicalEthAdjustedProjectedAPR.push(newMedianEthAdjustedProjectedAPR);
  
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
  if (historicalEthAdjustedROI.length > 7) {
    historicalEthAdjustedROI.shift(); // Remove first element
  }
  if (historicalEthAdjustedAPR.length > 7) {
    historicalEthAdjustedAPR.shift(); // Remove first element
  }
  if (historicalEthAdjustedProjectedROI.length > 7) {
    historicalEthAdjustedProjectedROI.shift(); // Remove first element
  }
  if (historicalEthAdjustedProjectedAPR.length > 7) {
    historicalEthAdjustedProjectedAPR.shift(); // Remove first element
  }
  
  return [
    historicalROI, 
    historicalAPR, 
    historicalProjectedROI, 
    historicalProjectedAPR,
    historicalEthAdjustedROI,
    historicalEthAdjustedAPR,
    historicalEthAdjustedProjectedROI,
    historicalEthAdjustedProjectedAPR
  ];
}

/**
 * Create or update DailyPopulationMetric entity with calculated metrics
 * @param medianROI Calculated median ROI
 * @param medianAPR Calculated median APR
 * @param medianProjectedROI Calculated median projected ROI
 * @param medianProjectedAPR Calculated median projected APR
 * @param medianEthAdjustedROI Calculated median ETH-adjusted ROI
 * @param medianEthAdjustedAPR Calculated median ETH-adjusted APR
 * @param medianEthAdjustedProjectedROI Calculated median ETH-adjusted projected ROI
 * @param medianEthAdjustedProjectedAPR Calculated median ETH-adjusted projected APR
 * @param sma7dROI Calculated 7-day SMA ROI
 * @param sma7dAPR Calculated 7-day SMA APR
 * @param sma7dProjectedROI Calculated 7-day SMA projected ROI
 * @param sma7dProjectedAPR Calculated 7-day SMA projected APR
 * @param sma7dEthAdjustedROI Calculated 7-day SMA ETH-adjusted ROI
 * @param sma7dEthAdjustedAPR Calculated 7-day SMA ETH-adjusted APR
 * @param sma7dEthAdjustedProjectedROI Calculated 7-day SMA ETH-adjusted projected ROI
 * @param sma7dEthAdjustedProjectedAPR Calculated 7-day SMA ETH-adjusted projected APR
 * @param historicalROI Updated historical ROI array
 * @param historicalAPR Updated historical APR array
 * @param historicalProjectedROI Updated historical projected ROI array
 * @param historicalProjectedAPR Updated historical projected APR array
 * @param historicalEthAdjustedROI Updated historical ETH-adjusted ROI array
 * @param historicalEthAdjustedAPR Updated historical ETH-adjusted APR array
 * @param historicalEthAdjustedProjectedROI Updated historical ETH-adjusted projected ROI array
 * @param historicalEthAdjustedProjectedAPR Updated historical ETH-adjusted projected APR array
 * @param totalAgents Number of agents included in calculation
 * @param block Current block
 */
export function updateDailyPopulationMetricEntity(
  medianROI: BigDecimal,
  medianAPR: BigDecimal,
  medianProjectedROI: BigDecimal,
  medianProjectedAPR: BigDecimal,
  medianEthAdjustedROI: BigDecimal,
  medianEthAdjustedAPR: BigDecimal,
  medianEthAdjustedProjectedROI: BigDecimal,
  medianEthAdjustedProjectedAPR: BigDecimal,
  sma7dROI: BigDecimal,
  sma7dAPR: BigDecimal,
  sma7dProjectedROI: BigDecimal,
  sma7dProjectedAPR: BigDecimal,
  sma7dEthAdjustedROI: BigDecimal,
  sma7dEthAdjustedAPR: BigDecimal,
  sma7dEthAdjustedProjectedROI: BigDecimal,
  sma7dEthAdjustedProjectedAPR: BigDecimal,
  historicalROI: BigDecimal[],
  historicalAPR: BigDecimal[],
  historicalProjectedROI: BigDecimal[],
  historicalProjectedAPR: BigDecimal[],
  historicalEthAdjustedROI: BigDecimal[],
  historicalEthAdjustedAPR: BigDecimal[],
  historicalEthAdjustedProjectedROI: BigDecimal[],
  historicalEthAdjustedProjectedAPR: BigDecimal[],
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
  
  // Set population metrics (unrealized PnL)
  dailyPopulationMetric.medianUnrealisedPnL = medianProjectedROI;
  dailyPopulationMetric.medianProjectedUnrealisedPnL = medianProjectedAPR;
  
  // Set population metrics (ETH-adjusted actual)
  dailyPopulationMetric.medianEthAdjustedROI = medianEthAdjustedROI;
  dailyPopulationMetric.medianEthAdjustedAPR = medianEthAdjustedAPR;
  
  // Set population metrics (ETH-adjusted unrealized PnL)
  dailyPopulationMetric.medianEthAdjustedUnrealisedPnL = medianEthAdjustedProjectedROI;
  dailyPopulationMetric.medianEthAdjustedProjectedUnrealisedPnL = medianEthAdjustedProjectedAPR;
  
  // Set 7-day simple moving averages (actual)
  dailyPopulationMetric.sma7dROI = sma7dROI;
  dailyPopulationMetric.sma7dAPR = sma7dAPR;
  
  // Set 7-day simple moving averages (unrealized PnL)
  dailyPopulationMetric.sma7dUnrealisedPnL = sma7dProjectedROI;
  dailyPopulationMetric.sma7dProjectedUnrealisedPnL = sma7dProjectedAPR;
  
  // Set 7-day simple moving averages (ETH-adjusted actual)
  dailyPopulationMetric.sma7dEthAdjustedROI = sma7dEthAdjustedROI;
  dailyPopulationMetric.sma7dEthAdjustedAPR = sma7dEthAdjustedAPR;
  
  // Set 7-day simple moving averages (ETH-adjusted unrealized PnL)
  dailyPopulationMetric.sma7dEthAdjustedUnrealisedPnL = sma7dEthAdjustedProjectedROI;
  dailyPopulationMetric.sma7dEthAdjustedProjectedUnrealisedPnL = sma7dEthAdjustedProjectedAPR;
  
  // Set metadata
  dailyPopulationMetric.timestamp = dayTimestamp; // Use day timestamp for consistency
  dailyPopulationMetric.block = block.number;
  dailyPopulationMetric.totalAgents = totalAgents as i32;
  
  // Set historical data (actual)
  dailyPopulationMetric.historicalMedianROI = historicalROI;
  dailyPopulationMetric.historicalMedianAPR = historicalAPR;
  
  // Set historical data (unrealized PnL)
  dailyPopulationMetric.historicalMedianUnrealisedPnL = historicalProjectedROI;
  dailyPopulationMetric.historicalMedianProjectedUnrealisedPnL = historicalProjectedAPR;
  
  // Set historical data (ETH-adjusted actual)
  dailyPopulationMetric.historicalMedianEthAdjustedROI = historicalEthAdjustedROI;
  dailyPopulationMetric.historicalMedianEthAdjustedAPR = historicalEthAdjustedAPR;
  
  // Set historical data (ETH-adjusted unrealized PnL)
  dailyPopulationMetric.historicalMedianEthAdjustedUnrealisedPnL = historicalEthAdjustedProjectedROI;
  dailyPopulationMetric.historicalMedianEthAdjustedProjectedUnrealisedPnL = historicalEthAdjustedProjectedAPR;
  
  dailyPopulationMetric.save();
  
  log.info("Created DailyPopulationMetric entity for day timestamp {} with {} agents, median ROI: {}, median APR: {}, projected ROI: {}, projected APR: {}, ETH-adjusted ROI: {}, ETH-adjusted APR: {}", [
    dayTimestamp.toString(),
    totalAgents.toString(),
    medianROI.toString(),
    medianAPR.toString(),
    medianProjectedROI.toString(),
    medianProjectedAPR.toString(),
    medianEthAdjustedROI.toString(),
    medianEthAdjustedAPR.toString()
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
  
  // Extract ROI and APR values from snapshots with selective filtering
  let roiValues: BigDecimal[] = [];
  let aprValues: BigDecimal[] = [];
  let projectedRoiValues: BigDecimal[] = [];
  let projectedAprValues: BigDecimal[] = [];
  let ethAdjustedRoiValues: BigDecimal[] = [];
  let ethAdjustedAprValues: BigDecimal[] = [];
  let ethAdjustedProjectedRoiValues: BigDecimal[] = [];
  let ethAdjustedProjectedAprValues: BigDecimal[] = [];
  
  // Track exclusions for logging
  let totalSnapshots = snapshots.length;
  let excludedFromProjected = 0;
  
  for (let i = 0; i < snapshots.length; i++) {
    let snapshot = snapshots[i];
    let shouldExclude = shouldExcludeFromProjectedROI(snapshot);
    
    // Always include in actual ROI and ETH-adjusted actual ROI calculations
    roiValues.push(snapshot.roi);
    aprValues.push(snapshot.apr);
    ethAdjustedRoiValues.push(snapshot.ethAdjustedRoi);
    ethAdjustedAprValues.push(snapshot.ethAdjustedApr);
    
    // Conditionally include in unrealized PnL and ETH-adjusted unrealized PnL calculations
    if (shouldExclude) {
      excludedFromProjected++;
      log.info("Excluding agent {} from unrealized PnL calculations - initial: {} USD, final: {} USD", [
        snapshot.service.toHexString(),
        snapshot.initialValue.toString(),
        snapshot.finalValue.toString()
      ]);
    } else {
      projectedRoiValues.push(snapshot.unrealisedPnL);
      projectedAprValues.push(snapshot.projectedUnrealisedPnL);
      ethAdjustedProjectedRoiValues.push(snapshot.ethAdjustedUnrealisedPnL);
      ethAdjustedProjectedAprValues.push(snapshot.ethAdjustedProjectedUnrealisedPnL);
    }
  }
  
  log.info("Median calculation summary - Total snapshots: {}, Excluded from unrealized PnL: {}, Included in unrealized PnL: {}", [
    totalSnapshots.toString(),
    excludedFromProjected.toString(),
    (totalSnapshots - excludedFromProjected).toString()
  ]);
  
  // Calculate median values (both actual and unrealized PnL, including ETH-adjusted)
  let medianROI = calculateMedian(roiValues);
  let medianAPR = calculateMedian(aprValues);
  let medianUnrealisedPnL = calculateMedian(projectedRoiValues);
  let medianProjectedUnrealisedPnL = calculateMedian(projectedAprValues);
  let medianEthAdjustedROI = calculateMedian(ethAdjustedRoiValues);
  let medianEthAdjustedAPR = calculateMedian(ethAdjustedAprValues);
  let medianEthAdjustedUnrealisedPnL = calculateMedian(ethAdjustedProjectedRoiValues);
  let medianEthAdjustedProjectedUnrealisedPnL = calculateMedian(ethAdjustedProjectedAprValues);
  
  // Get previous DailyPopulationMetric entity for historical data using day timestamp
  let previousDailyPopulationMetric = getPreviousDailyPopulationMetric(dayTimestamp);
  let historicalROI: BigDecimal[] = [];
  let historicalAPR: BigDecimal[] = [];
  let historicalProjectedROI: BigDecimal[] = [];
  let historicalProjectedAPR: BigDecimal[] = [];
  let historicalEthAdjustedROI: BigDecimal[] = [];
  let historicalEthAdjustedAPR: BigDecimal[] = [];
  let historicalEthAdjustedProjectedROI: BigDecimal[] = [];
  let historicalEthAdjustedProjectedAPR: BigDecimal[] = [];
  
  if (previousDailyPopulationMetric) {
    historicalROI = previousDailyPopulationMetric.historicalMedianROI;
    historicalAPR = previousDailyPopulationMetric.historicalMedianAPR;
    historicalProjectedROI = previousDailyPopulationMetric.historicalMedianUnrealisedPnL;
    historicalProjectedAPR = previousDailyPopulationMetric.historicalMedianProjectedUnrealisedPnL;
    historicalEthAdjustedROI = previousDailyPopulationMetric.historicalMedianEthAdjustedROI;
    historicalEthAdjustedAPR = previousDailyPopulationMetric.historicalMedianEthAdjustedAPR;
    historicalEthAdjustedProjectedROI = previousDailyPopulationMetric.historicalMedianEthAdjustedUnrealisedPnL;
    historicalEthAdjustedProjectedAPR = previousDailyPopulationMetric.historicalMedianEthAdjustedProjectedUnrealisedPnL;
  }
  
  // Update historical arrays with new median values (all 8 metrics)
  let updatedHistorical = updateHistoricalArrays(
    historicalROI, 
    historicalAPR, 
    historicalProjectedROI, 
    historicalProjectedAPR,
    historicalEthAdjustedROI,
    historicalEthAdjustedAPR,
    historicalEthAdjustedProjectedROI,
    historicalEthAdjustedProjectedAPR,
    medianROI, 
    medianAPR, 
    medianUnrealisedPnL, 
    medianProjectedUnrealisedPnL,
    medianEthAdjustedROI,
    medianEthAdjustedAPR,
    medianEthAdjustedUnrealisedPnL,
    medianEthAdjustedProjectedUnrealisedPnL
  );
  let updatedHistoricalROI = updatedHistorical[0];
  let updatedHistoricalAPR = updatedHistorical[1];
  let updatedHistoricalProjectedROI = updatedHistorical[2];
  let updatedHistoricalProjectedAPR = updatedHistorical[3];
  let updatedHistoricalEthAdjustedROI = updatedHistorical[4];
  let updatedHistoricalEthAdjustedAPR = updatedHistorical[5];
  let updatedHistoricalEthAdjustedProjectedROI = updatedHistorical[6];
  let updatedHistoricalEthAdjustedProjectedAPR = updatedHistorical[7];
  
  // Calculate 7-day simple moving averages (all 8 metrics)
  let sma7dROI = calculate7DaysSMA(updatedHistoricalROI);
  let sma7dAPR = calculate7DaysSMA(updatedHistoricalAPR);
  let sma7dProjectedROI = calculate7DaysSMA(updatedHistoricalProjectedROI);
  let sma7dProjectedAPR = calculate7DaysSMA(updatedHistoricalProjectedAPR);
  let sma7dEthAdjustedROI = calculate7DaysSMA(updatedHistoricalEthAdjustedROI);
  let sma7dEthAdjustedAPR = calculate7DaysSMA(updatedHistoricalEthAdjustedAPR);
  let sma7dEthAdjustedProjectedROI = calculate7DaysSMA(updatedHistoricalEthAdjustedProjectedROI);
  let sma7dEthAdjustedProjectedAPR = calculate7DaysSMA(updatedHistoricalEthAdjustedProjectedAPR);
  
  // Create and save DailyPopulationMetric entity (all 26 parameters)
  updateDailyPopulationMetricEntity(
    medianROI,
    medianAPR,
    medianUnrealisedPnL,
    medianProjectedUnrealisedPnL,
    medianEthAdjustedROI,
    medianEthAdjustedAPR,
    medianEthAdjustedUnrealisedPnL,
    medianEthAdjustedProjectedUnrealisedPnL,
    sma7dROI,
    sma7dAPR,
    sma7dProjectedROI,
    sma7dProjectedAPR,
    sma7dEthAdjustedROI,
    sma7dEthAdjustedAPR,
    sma7dEthAdjustedProjectedROI,
    sma7dEthAdjustedProjectedAPR,
    updatedHistoricalROI,
    updatedHistoricalAPR,
    updatedHistoricalProjectedROI,
    updatedHistoricalProjectedAPR,
    updatedHistoricalEthAdjustedROI,
    updatedHistoricalEthAdjustedAPR,
    updatedHistoricalEthAdjustedProjectedROI,
    updatedHistoricalEthAdjustedProjectedAPR,
    snapshots.length,
    block
  );
  
  log.info("Population metrics calculation completed successfully for day {} - actual: ROI {}, APR {} | unrealized PnL: {}, projected: {}", [
    dayTimestamp.toString(),
    medianROI.toString(),
    medianAPR.toString(),
    medianUnrealisedPnL.toString(),
    medianProjectedUnrealisedPnL.toString()
  ]);
}
