import { 
  Mint as RouterMint
} from "../generated/VeloV2Router/VelodromeV2Router"
import { 
  VelodromeV2Pool,
  Transfer
} from "../generated/templates/VeloV2Pool/VelodromeV2Pool"
import { ensureVeloV2PoolTemplate } from "./veloV2Shared"
import { log, Address } from "@graphprotocol/graph-ts"
import { isSafe } from "./common"

// Handle VelodromeV2 Router Mint events
export function handleVeloV2RouterMint(event: RouterMint): void {
  // Check if the recipient is our Safe
  if (isSafe(event.params.to)) {
    // Ensure we have a template for this pool
    ensureVeloV2PoolTemplate(event.params.pool)
    
    // The Transfer event from the pool will handle position creation
  }
}
