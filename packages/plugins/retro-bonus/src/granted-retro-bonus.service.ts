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
        await repo.save(existing ? Object.assign(existing, input) : repo.create(input));
    }

    // A 1C unposting tombstone — a later higher-version event re-creates the row via upsert.
    async remove(ctx: RequestContext, erpId: string): Promise<void> {
        await this.connection.getRepository(ctx, GrantedRetroBonus).delete({ erpId });
    }

    findForRecipient(
        ctx: RequestContext,
        recipientCounterpartyErpId: string,
        options?: ListQueryOptions<GrantedRetroBonus>,
    ): Promise<PaginatedList<GrantedRetroBonus>> {
        return this.listQueryBuilder
            .build(GrantedRetroBonus, options, {
                ctx,
                where: { recipientCounterpartyErpId },
            })
            .getManyAndCount()
            .then(([items, totalItems]) => ({ items, totalItems }));
    }
}
