import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { DiscountSetupService } from '@mivend/plugin-price-entry';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { parseDiscountSetup } from './discount-setup-payload';

const loggerCtx = 'IntegrationDiscountSetupHandler';

// Applies `discount-setup` (one event per ERP setup document) into DiscountSetup plus its recipient
// and product sets, replaced as a unit.
@Injectable()
export class DiscountSetupStreamHandler implements InboundStreamHandler {
    constructor(private readonly discountSetupService: DiscountSetupService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const parsed = parseDiscountSetup(entityId, payload);
        if (parsed.kind !== 'upsert') {
            const result = await this.discountSetupService.deactivate(
                ctx,
                entityId,
                parsed.version,
            );
            Logger.verbose(`discount-setup ${entityId}: ${parsed.kind} -> ${result}`, loggerCtx);
            if (result === 'stale') {
                return inboundNoop(
                    `discount-setup ${entityId}: ${parsed.kind} does not beat the stored version`,
                );
            }
            return result === 'deactivated'
                ? inboundApplied()
                : inboundNoop(`discount-setup ${entityId}: ${parsed.kind} for an unknown rule`);
        }
        const result = await this.discountSetupService.apply(ctx, parsed.input);
        if (result === 'stale') {
            return inboundNoop(`discount-setup ${entityId}: version does not beat the stored one`);
        }
        if (result === 'unchanged') {
            return inboundNoop(`discount-setup ${entityId}: content unchanged`);
        }
        const { setup } = parsed.input;
        if (result === 'unknown-condition') {
            return inboundNoop(
                `discount-setup ${entityId}: not applied (unknown condition ${setup.conditionName})`,
            );
        }
        return setup.active
            ? inboundApplied()
            : inboundNoop(`discount-setup ${entityId}: not applied (${setup.inactiveReason})`);
    }
}
