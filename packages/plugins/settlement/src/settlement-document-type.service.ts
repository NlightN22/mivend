import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

import { SettlementDocumentType } from './entities/settlement-document-type.entity';
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
}
