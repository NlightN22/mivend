import { Injectable, Logger } from '@nestjs/common';
import {
    ListQueryBuilder,
    ListQueryOptions,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import { GrantedRetroBonus } from './granted-retro-bonus.entity';
import { isVersionNewer } from './version-compare';
import { loggerCtx } from './types';

export interface GrantedRetroBonusUpsertInput {
    erpId: string;
    sourceDocumentErpId: string;
    sourceCounterpartyErpId: string;
    recipientCounterpartyErpId: string;
    productErpId: string;
    discountDocumentErpId: string | null;
    operationKind: string | null;
    accrualKind: string | null;
    percent: number;
    quantity: number;
    amount: number;
    orderErpId: string | null;
    sourceVersion: string;
}

@Injectable()
export class GrantedRetroBonusService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    async upsert(ctx: RequestContext, input: GrantedRetroBonusUpsertInput): Promise<void> {
        const repo = this.connection.getRepository(ctx, GrantedRetroBonus);
        const existing = await repo.findOne({ where: { erpId: input.erpId } });
        if (existing && !isVersionNewer(input.sourceVersion, existing.sourceVersion)) {
            Logger.warn(
                `granted-retro-bonus ${input.erpId}: version=${input.sourceVersion} does not ` +
                    `beat stored version=${existing.sourceVersion} — skipping`,
                loggerCtx,
            );
            return;
        }
        await repo.save(
            existing
                ? Object.assign(existing, input, { isDeleted: false })
                : repo.create({ ...input, isDeleted: false }),
        );
    }

    // A tombstone wins a version tie (update + cancel can share one 1C timestamp); upsert's
    // strictly-newer guard then keeps the row removed against a same-version delayed upsert.
    async remove(ctx: RequestContext, erpId: string, version: string): Promise<void> {
        const repo = this.connection.getRepository(ctx, GrantedRetroBonus);
        const existing = await repo.findOne({ where: { erpId } });
        if (!existing || isVersionNewer(existing.sourceVersion, version)) return;
        await repo.save(Object.assign(existing, { isDeleted: true, sourceVersion: version }));
    }

    findForRecipient(
        ctx: RequestContext,
        recipientCounterpartyErpId: string,
        options?: ListQueryOptions<GrantedRetroBonus>,
    ): Promise<PaginatedList<GrantedRetroBonus>> {
        return this.listQueryBuilder
            .build(GrantedRetroBonus, options, {
                ctx,
                where: { recipientCounterpartyErpId, isDeleted: false },
            })
            .getManyAndCount()
            .then(([items, totalItems]) => ({ items, totalItems }));
    }
}
