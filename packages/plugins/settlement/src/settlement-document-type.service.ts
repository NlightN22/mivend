import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

import { SettlementDocumentType } from './entities/settlement-document-type.entity';
import type { SettlementDocumentTypeInfo } from './settlement-admin.types';
import type { SettlementApplyResult, SettlementDocumentTypeInput } from './types';
import { shouldApplyDocument } from './version';

export const documentTypeLockKey = (documentType: string): string =>
    `settlement-document-type:${documentType}`;

@Injectable()
export class SettlementDocumentTypeService {
    constructor(private readonly connection: TransactionalConnection) {}

    async apply(
        ctx: RequestContext,
        input: SettlementDocumentTypeInput,
    ): Promise<SettlementApplyResult> {
        return withAggregateLock(
            this.connection,
            ctx,
            documentTypeLockKey(input.documentType),
            lockedCtx => this.write(lockedCtx, input),
        );
    }

    private async write(
        ctx: RequestContext,
        input: SettlementDocumentTypeInput,
    ): Promise<SettlementApplyResult> {
        const repo = this.connection.getRepository(ctx, SettlementDocumentType);
        const existing = await repo.findOne({ where: { documentType: input.documentType } });
        if (!existing && input.isDeleted) return 'unknown-deleted';
        const stored = existing
            ? { version: existing.sourceVersion, isDeleted: existing.isDeleted }
            : null;
        if (!shouldApplyDocument(input, stored)) return 'stale';

        const fields = {
            label: input.label,
            category: input.category,
            customerVisible: input.customerVisible,
            sortOrder: input.sortOrder,
            isDeleted: input.isDeleted,
            sourceVersion: input.version,
        };
        if (existing) await repo.update(existing.id, fields);
        else await repo.save(repo.create({ documentType: input.documentType, ...fields }));
        return 'applied';
    }

    // Registry rows plus types seen only on documents (label from the document); no counts, no scope.
    // The distinct types are walked through the documentType index, so the cost does not grow with the table.
    async listAll(ctx: RequestContext): Promise<SettlementDocumentTypeInfo[]> {
        const rows: Array<{ documentType: string; label: string; category: string | null; movesTurnover: boolean }> =
            // unbounded-ok: one row per document type from a loose index scan
            await this.connection.getRepository(ctx, SettlementDocumentType).query(`
                WITH RECURSIVE seen("documentType") AS (
                    (SELECT "documentType" FROM "settlement_document" WHERE NOT "isDeleted"
                        ORDER BY "documentType" LIMIT 1)
                    UNION ALL
                    SELECT (SELECT d."documentType" FROM "settlement_document" d
                        WHERE NOT d."isDeleted" AND d."documentType" > seen."documentType"
                        ORDER BY d."documentType" LIMIT 1)
                    FROM seen WHERE seen."documentType" IS NOT NULL
                )
                SELECT t."documentType", t."label", t."category", t."movesTurnover" FROM "settlement_document_type" t
                    WHERE NOT t."isDeleted"
                UNION ALL
                SELECT s."documentType",
                    (SELECT d."documentTypeLabel" FROM "settlement_document" d
                        WHERE d."documentType" = s."documentType" AND NOT d."isDeleted" LIMIT 1),
                    NULL, false
                FROM seen s
                WHERE s."documentType" IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM "settlement_document_type" t
                        WHERE t."documentType" = s."documentType" AND NOT t."isDeleted")
                ORDER BY 1`);
        return rows;
    }
}
