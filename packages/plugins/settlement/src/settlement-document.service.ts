import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

import { toMinorUnits } from './amount';
import { SettlementDocumentEntry } from './entities/settlement-document-entry.entity';
import { SettlementDocument } from './entities/settlement-document.entity';
import { SettlementOrderLink } from './entities/settlement-order-link.entity';
import { SettlementReferenceResolver } from './settlement-reference-resolver';
import type { ResolvedReferences } from './settlement-reference-resolver';
import {
    contractLockKey,
    counterpartyLockKey,
    orderLockKey,
    withSortedLocks,
} from './settlement-locks';
import type { SettlementApplyResult, SettlementDocumentInput } from './types';
import { shouldApplyDocument } from './version';

export const documentLockKey = (erpId: string): string => `settlement-document:${erpId}`;

@Injectable()
export class SettlementDocumentService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly resolver: SettlementReferenceResolver,
    ) {}

    async apply(
        ctx: RequestContext,
        input: SettlementDocumentInput,
    ): Promise<SettlementApplyResult> {
        const keys = input.entries.flatMap(entry => [
            counterpartyLockKey(entry.counterpartyErpId),
            contractLockKey(entry.contractErpId),
            ...entry.orderLinks.map(link => orderLockKey(link.orderErpId)),
        ]);
        return withAggregateLock(this.connection, ctx, documentLockKey(input.erpId), docCtx =>
            withSortedLocks(this.connection, docCtx, keys, lockedCtx =>
                this.write(lockedCtx, input),
            ),
        );
    }

    private async write(
        ctx: RequestContext,
        input: SettlementDocumentInput,
    ): Promise<SettlementApplyResult> {
        const repo = this.connection.getRepository(ctx, SettlementDocument);
        const existing = await repo.findOne({ where: { erpId: input.erpId } });
        if (!existing && input.isDeleted) return 'unknown-deleted';
        const stored = existing
            ? { version: existing.sourceVersion, isDeleted: existing.isDeleted }
            : null;
        if (!shouldApplyDocument(input, stored)) return 'stale';

        if (input.isDeleted && existing) {
            await repo.update(existing.id, { isDeleted: true, sourceVersion: input.version });
            return 'applied';
        }
        const document = await this.saveHeader(ctx, existing, input);
        await this.connection
            .getRepository(ctx, SettlementDocumentEntry)
            .delete({ documentId: document.id });
        await this.insertEntries(ctx, document.id, input);
        return 'applied';
    }

    private async saveHeader(
        ctx: RequestContext,
        existing: SettlementDocument | null,
        input: SettlementDocumentInput,
    ): Promise<SettlementDocument> {
        const repo = this.connection.getRepository(ctx, SettlementDocument);
        const fields = {
            documentType: input.documentType,
            documentTypeLabel: input.documentTypeLabel,
            number: input.number,
            date: input.date as Date,
            isDeleted: false,
            sourceVersion: input.version,
        };
        if (existing) {
            await repo.update(existing.id, fields);
            return existing;
        }
        return repo.save(repo.create({ erpId: input.erpId, isErpOwned: true, ...fields }));
    }

    private async insertEntries(
        ctx: RequestContext,
        documentId: number,
        input: SettlementDocumentInput,
    ): Promise<void> {
        if (input.entries.length === 0) return;
        const refs = await this.resolver.resolve(ctx, {
            counterpartyErpIds: input.entries.map(e => e.counterpartyErpId),
            contractErpIds: input.entries.map(e => e.contractErpId),
            orders: input.entries.flatMap(e => e.orderLinks),
        });
        const entryRepo = this.connection.getRepository(ctx, SettlementDocumentEntry);
        const saved = await entryRepo.save(
            input.entries.map(entry =>
                entryRepo.create({
                    documentId,
                    organizationErpId: entry.organizationErpId,
                    counterpartyErpId: entry.counterpartyErpId,
                    contractErpId: entry.contractErpId,
                    counterpartyId: refs.counterparties.get(entry.counterpartyErpId) ?? null,
                    contractId: refs.contracts.get(entry.contractErpId) ?? null,
                    currency: entry.currency,
                    amountMinor: toMinorUnits(entry.amount),
                    dueDate: entry.dueDate,
                }),
            ),
        );
        const links = this.buildLinks(saved, input, refs);
        if (links.length > 0) {
            await this.connection.getRepository(ctx, SettlementOrderLink).save(links);
        }
    }

    private buildLinks(
        saved: SettlementDocumentEntry[],
        input: SettlementDocumentInput,
        refs: ResolvedReferences,
    ): SettlementOrderLink[] {
        return saved.flatMap((entry, index) =>
            input.entries[index].orderLinks.map(link => {
                const row = new SettlementOrderLink();
                row.entryId = entry.id;
                row.orderErpId = link.orderErpId;
                row.orderUuid = link.orderUuid;
                row.orderId = refs.orders.get(link.orderErpId) ?? null;
                row.amountMinor = toMinorUnits(link.amount);
                return row;
            }),
        );
    }
}
