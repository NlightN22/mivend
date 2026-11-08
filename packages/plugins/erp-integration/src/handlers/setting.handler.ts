import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { SettingErp } from '../entities/setting-erp.entity';
import { optionalText, upsertErpMirror } from './erp-mirror-upsert';
import { inboundApplied } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

// `setting` stream, stored as sent; a tombstone only sets isDeleted.
@Injectable()
export class SettingStreamHandler implements InboundStreamHandler {
    constructor(private readonly connection: TransactionalConnection) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        await upsertErpMirror(
            this.connection.getRepository(ctx, SettingErp),
            entityId,
            {
                code: optionalText(payload.code),
                boolValue: typeof payload.boolValue === 'boolean' ? payload.boolValue : null,
            },
            { isDeleted: payload.isDeleted === true },
        );
        return inboundApplied();
    }
}
