import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { ContractProformaPurgeService } from '@mivend/plugin-acquiring';
import { In } from 'typeorm';

import { Document } from './entities/document.entity';
import { DocumentPdfStorageService } from './pdf/document-pdf-storage.service';

export const CONTRACT_PROFORMA_RETENTION_MONTHS_DEFAULT = 6;
const BATCH_SIZE = 500;
const loggerCtx = 'ContractProformaCleanup';

@Injectable()
export class ContractProformaCleanupService {
    constructor(
        private connection: TransactionalConnection,
        private purge: ContractProformaPurgeService,
        private storage: DocumentPdfStorageService,
    ) {}

    async run(
        ctx: RequestContext,
        retentionMonths: number,
        batchSize = BATCH_SIZE,
    ): Promise<number> {
        let total = 0;
        for (;;) {
            const uuids: string[] = [];
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
                    for (const doc of docs) uuids.push(doc.uuid);
                    await repo.delete(where);
                },
            );
            // Files go after commit: a rolled-back batch must not lose a PDF that is still referenced.
            await this.deleteFiles(uuids);
            total += deleted;
            if (deleted < batchSize) return total;
        }
    }

    private async deleteFiles(uuids: string[]): Promise<void> {
        for (const uuid of uuids) {
            try {
                await this.storage.remove(uuid);
            } catch (e) {
                // The rows are already gone; an orphaned PDF is accepted rather than stopping the purge.
                Logger.error(`Failed to delete PDF ${uuid}: ${String(e)}`, loggerCtx);
            }
        }
    }
}
