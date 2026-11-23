// studio babydegen-base src/helpers.ts refreshAllActivePositions: the
// protocol dispatch the snapshot scheduler runs before a snapshot
// (scheduler.ts snapshotPortfolio).

import { refreshVeloCLPosition, NO_TX } from "./cl";
import { PROTOCOL_AERO_CL, PROTOCOL_AERO_V2, PROTOCOL_VELODROME_V2, PROTOCOL_VELODROME_V3 } from "./constants";
import { ProtocolPosition, Service } from "./model";
import type { PosCtx } from "./positions";
import type { At } from "./pricing";
import { refreshVeloV2Position } from "./v2";

export async function refreshAllActivePositions(ctx: PosCtx, serviceSafe: string, at: At, updatePortfolio: boolean): Promise<void> {
  const service = await ctx.cache.get(Service, serviceSafe);
  if (service == null) return;
  for (const id of service.positionIds) {
    const p = await ctx.cache.get(ProtocolPosition, id);
    if (p == null || !p.isActive) continue;
    if (p.protocol === PROTOCOL_VELODROME_V2 || p.protocol === PROTOCOL_AERO_V2) {
      await refreshVeloV2Position(ctx, p.agent, p.pool, at, NO_TX, updatePortfolio);
    } else if (p.protocol === PROTOCOL_VELODROME_V3 || p.protocol === PROTOCOL_AERO_CL) {
      await refreshVeloCLPosition(ctx, p.id, p.tokenId, at, NO_TX, updatePortfolio);
    }
  }
}
