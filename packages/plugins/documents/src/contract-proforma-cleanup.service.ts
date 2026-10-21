import { Injectable } from '@nestjs/common';
import { AssetService, ID, Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { ContractProformaPurgeService } from '@mivend/plugin-acquiring';
import { In } from 'typeorm';

import { Document } from './entities/document.entity';

export const CONTRACT_PROFORMA_RETENTION_MONTHS_DEFAULT = 6;
const BATCH_SIZE = 500;
const loggerCtx = 'ContractProformaCleanup';

@Injectable()
export class ContractProformaCleanupService {
    constructor(
        private connection: TransactionalConnection,
        private purge: ContractProformaPurgeService,
        private assetService: AssetService,
    ) {}

    async run(
        ctx: RequestContext,
        retentionMonths: number,
        batchSize = BATCH_SIZE,
    ): Promise<number> {
        let total = 0;
        for (;;) {
            const assetIds: ID[] = [];
            const deleted = await this.purge.purgeBatch(
                ctx,
                retentionMonths,
                batchSize,
                async (txCtx, ids) => {
                    const repo = this.connection.getRepository(txCtx, Document);
                    const where = {
                        type: 'proforma-invoice',
                        proformaInvoiceId: In(ids.map(String)),
                    };
                    const docs = await repo.find({ where });
                    for (const doc of docs) if (doc.assetId) assetIds.push(doc.assetId);
                    await repo.delete(where);
                },
            );
            // Files go after commit: a rolled-back batch must not lose a PDF that is still referenced.
            if (assetIds.length > 0) await this.deleteAssets(ctx, assetIds);
            total += deleted;
            if (deleted < batchSize) return total;
        }
    }

    private async deleteAssets(ctx: RequestContext, assetIds: ID[]): Promise<void> {
        try {
            await this.assetService.delete(ctx, assetIds, true, true);
        } catch (e) {
            // The rows are already gone; an orphaned PDF is accepted rather than stopping the purge.
            Logger.error(`Failed to delete assets ${assetIds.join(',')}: ${String(e)}`, loggerCtx);
        }
    }
}
