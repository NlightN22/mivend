import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { CrossReferenceService } from '@mivend/plugin-cross-reference';
import type { CrossReferenceRecord } from '../types';

const loggerCtx = 'ErpCrossReferenceHandler';

@Injectable()
export class CrossReferenceHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly crossReferenceService: CrossReferenceService,
    ) {}

    async upsert(ctx: RequestContext, record: CrossReferenceRecord): Promise<void> {
        const row = await this.connection.rawConnection
            .createQueryBuilder()
            .select('p.id', 'id')
            .from('product', 'p')
            .where('p."customFieldsExternalid" = :extId', { extId: record.externalId })
            .getRawOne<{ id: string }>();

        if (!row) {
            Logger.warn(
                `Product not found for externalId=${record.externalId}, skipping`,
                loggerCtx,
            );
            return;
        }

        await this.crossReferenceService.upsertForProduct(ctx, Number(row.id), record.refs);
    }
}
