import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { RetroBonusRuleService } from '@mivend/plugin-retro-bonus';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { parseRetroBonusSetup } from './retro-bonus-setup-payload';

const loggerCtx = 'IntegrationRetroBonusSetupHandler';

// Applies `retro-bonus-setup` (one event per ERP setup document) into RetroBonusRule plus its
// member lists, replaced as a unit. A cancelled or unposted document only deactivates the rule.
@Injectable()
export class RetroBonusSetupStreamHandler implements InboundStreamHandler {
    constructor(private readonly retroBonusRuleService: RetroBonusRuleService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const parsed = parseRetroBonusSetup(entityId, payload);
        if (parsed.kind !== 'upsert') {
            const matched = await this.retroBonusRuleService.deactivate(
                ctx,
                entityId,
                parsed.version,
            );
            Logger.verbose(`retro-bonus-setup ${entityId}: deactivated=${matched}`, loggerCtx);
            return matched
                ? inboundApplied()
                : inboundNoop(`retro-bonus-setup ${entityId}: ${parsed.kind} for an unknown rule`);
        }
        const result = await this.retroBonusRuleService.apply(ctx, parsed.input);
        if (result === 'stale') {
            return inboundNoop(
                `retro-bonus-setup ${entityId}: version does not beat the stored one`,
            );
        }
        if (result === 'unchanged') {
            return inboundNoop(`retro-bonus-setup ${entityId}: content unchanged`);
        }
        Logger.verbose(
            `Applied retro-bonus setup ${entityId} counterparties=${parsed.input.counterpartyErpIds.length} products=${parsed.input.productErpIds.length}`,
            loggerCtx,
        );
        return inboundApplied();
    }
}
