import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { PointOfSaleTypeErp } from '@mivend/plugin-counterparty';

import { inboundApplied } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { activityFlags, optionalText, upsertErpMirror } from './erp-mirror-upsert';

// `point-of-sale-type` stream, stored as sent; links stay soft ids and a tombstone only sets the flags.
@Injectable()
export class PointOfSaleTypeStreamHandler implements InboundStreamHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        await upsertErpMirror(
            this.connection.getRepository(ctx, PointOfSaleTypeErp),
            entityId,
            {
                name: optionalText(payload.name),
                code: optionalText(payload.code),
            },
            activityFlags(payload),
        );
        return inboundApplied();
    }
}
