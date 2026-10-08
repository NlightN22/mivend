import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { RegionRecord } from '../entities/region-record.entity';
import { inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

function optionalString(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

// Applies the `region` stream (RegionChanged); a tombstone keeps the row with isDeleted set.
@Injectable()
export class RegionStreamHandler implements InboundStreamHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome | void> {
        const name = String(payload.name ?? '');
        const code = String(payload.code ?? '');
        if (!name || !code) {
            return inboundNoop(`region ${entityId}: missing name/code, skipping`);
        }
        const fields = {
            name,
            code,
            regionCode: optionalString(payload.regionCode),
            addressCode: optionalString(payload.addressCode),
            parentId: optionalString(payload.parentId),
            isActive: payload.isActive === true && payload.isDeleted !== true,
            isDeleted: payload.isDeleted === true,
        };
        const repo = this.connection.getRepository(ctx, RegionRecord);
        const existing = await repo.findOne({ where: { entityId } });
        await repo.save(
            existing ? { ...existing, ...fields } : repo.create({ entityId, ...fields }),
        );
    }
}
