import { Injectable } from '@nestjs/common';
import {
    GlobalSettingsService,
    Logger,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { withAggregateLock } from 'shared';

import { SettlementDocument } from './entities/settlement-document.entity';
import { documentLockKey } from './settlement-document.service';
import { REMOVABLE_DOCUMENT_PREDICATE } from './settlement-retention.sql';
import { DEFAULT_RETENTION_MONTHS, loggerCtx } from './types';

const BATCH_SIZE = 500;
const MAX_BATCHES_PER_RUN = 40;

@Injectable()
export class SettlementRetentionService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly globalSettingsService: GlobalSettingsService,
    ) {}

    async retentionMonths(ctx: RequestContext): Promise<number> {
        const settings = await this.globalSettingsService.getSettings(ctx);
        const months = settings.customFields?.settlementRetentionMonths;
        return months && months > 0 ? months : DEFAULT_RETENTION_MONTHS;
    }

    // Each delete re-checks the predicate under the document lock, so a document re-sent
    // concurrently is not removed from under the writer.
    async sweep(ctx: RequestContext): Promise<number> {
        const months = await this.retentionMonths(ctx);
        const repo = this.connection.getRepository(ctx, SettlementDocument);
        let removed = 0;
        let lastId = 0;
        for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
            const candidates: Array<{ id: number; erpId: string }> = await repo.query(
                `SELECT d.id, d."erpId" FROM settlement_document d
                 WHERE d.id > $2 AND ${REMOVABLE_DOCUMENT_PREDICATE}
                 ORDER BY d.id LIMIT ${BATCH_SIZE}`,
                [months, lastId],
            );
            for (const candidate of candidates) {
                removed += await this.removeIfStillRemovable(ctx, candidate, months);
            }
            if (candidates.length < BATCH_SIZE) break;
            lastId = candidates[candidates.length - 1].id;
        }
        Logger.info(
            `Settlement retention: removed ${removed} document(s) outside the ${months}-month window`,
            loggerCtx,
        );
        return removed;
    }

    private removeIfStillRemovable(
        ctx: RequestContext,
        candidate: { id: number; erpId: string },
        months: number,
    ): Promise<number> {
        return withAggregateLock(
            this.connection,
            ctx,
            documentLockKey(candidate.erpId),
            async txCtx => {
                const [rows]: [unknown[], number] = await this.connection
                    .getRepository(txCtx, SettlementDocument)
                    .query(
                        `DELETE FROM settlement_document d
                     WHERE d.id = $2 AND ${REMOVABLE_DOCUMENT_PREDICATE}
                     RETURNING d.id`,
                        [months, candidate.id],
                    );
                return rows.length;
            },
        );
    }
}
