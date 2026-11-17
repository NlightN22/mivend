import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

import { toMinorUnits } from './amount';
import { SettlementDocumentEntry } from './entities/settlement-document-entry.entity';
import { SettlementDocument } from './entities/settlement-document.entity';
import { SettlementOrderLink } from './entities/settlement-order-link.entity';
import { SettlementTurnoverRollupService } from './settlement-turnover-rollup.service';
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
        private readonly rollup: SettlementTurnoverRollupService,
    ) {}

    async apply(
        ctx: RequestContext,
        input: SettlementDocumentInput,
    ): Promise<SettlementApplyResult> {
        return withAggregateLock(
            this.connection,
            ctx,
            documentLockKey(input.erpId),
            async docCtx => {
                const stored = await this.storedCounterparties(docCtx, input.erpId);
                const storedDate = await this.storedDate(docCtx, input.erpId);
                const keys = [
                    ...stored.map(counterpartyLockKey),
                    ...input.entries.flatMap(entry => [
                        counterpartyLockKey(entry.counterpartyErpId),
                        contractLockKey(entry.contractErpId),
                        ...entry.orderLinks.map(link => orderLockKey(link.orderErpId)),
                    ]),
                ];
                return withSortedLocks(this.connection, docCtx, keys, async lockedCtx => {
                    const result = await this.write(lockedCtx, input);
                    if (result === 'applied') {
                        const touched = [...stored, ...input.entries.map(e => e.counterpartyErpId)];
                        const earlier = [storedDate, input.date].filter(
                            (d): d is Date => d != null,
                        );
                        const touchedFrom = earlier.length
                            ? new Date(Math.min(...earlier.map(d => d.getTime())))
                            : null;
                        await this.rollup.recompute(lockedCtx, touched, touchedFrom);
                    }
                    return result;
                });
            },
        );
    }

    private async storedDate(ctx: RequestContext, erpId: string): Promise<Date | null> {
        const row = await this.connection
            .getRepository(ctx, SettlementDocument)
            .findOne({ where: { erpId }, select: { id: true, date: true } });
        return row?.date ?? null;
    }

    // The document lock is held, so these entries cannot change before the counterparty locks are taken.
    private async storedCounterparties(ctx: RequestContext, erpId: string): Promise<string[]> {
        const rows: { id: string }[] = await this.connection
            .getRepository(ctx, SettlementDocumentEntry)
            .createQueryBuilder('e')
            .innerJoin('e.document', 'd')
            .where('d.erpId = :erpId', { erpId })
            .select('DISTINCT e.counterpartyErpId', 'id')
            .getRawMany(); // unbounded-ok: distinct counterparties of one document's entries
        return rows.map(r => r.id);
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
            accounting: input.accounting ?? null,
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
