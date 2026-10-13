import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

import { toMinorUnits } from './amount';
import { SettlementBalance } from './entities/settlement-balance.entity';
import { contractLockKey, counterpartyLockKey, withSortedLocks } from './settlement-locks';
import { SettlementReferenceResolver } from './settlement-reference-resolver';
import type { SettlementApplyResult, SettlementBalanceInput } from './types';
import { shouldApplyDocument } from './version';

export const balanceLockKey = (key: string): string => `settlement-balance:${key}`;

@Injectable()
export class SettlementBalanceService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly resolver: SettlementReferenceResolver,
    ) {}

    async apply(
        ctx: RequestContext,
        input: SettlementBalanceInput,
    ): Promise<SettlementApplyResult> {
        const keys = [
            counterpartyLockKey(input.counterpartyErpId),
            contractLockKey(input.contractErpId),
        ];
        return withAggregateLock(this.connection, ctx, balanceLockKey(input.key), keyCtx =>
            withSortedLocks(this.connection, keyCtx, keys, lockedCtx =>
                this.write(lockedCtx, input),
            ),
        );
    }

    private async write(
        ctx: RequestContext,
        input: SettlementBalanceInput,
    ): Promise<SettlementApplyResult> {
        const repo = this.connection.getRepository(ctx, SettlementBalance);
        const existing = await repo.findOne({ where: { balanceKey: input.key } });
        if (!existing && input.isDeleted) return 'unknown-deleted';
        const stored = existing
            ? { version: existing.sourceVersion, isDeleted: existing.isDeleted }
            : null;
        if (!shouldApplyDocument(input, stored)) return 'stale';

        if (input.isDeleted && existing) {
            await repo.update(existing.id, { isDeleted: true, sourceVersion: input.version });
            return 'applied';
        }
        const refs = await this.resolver.resolve(ctx, {
            counterpartyErpIds: [input.counterpartyErpId],
            contractErpIds: [input.contractErpId],
            orders: [],
        });
        const fields = {
            organizationErpId: input.organizationErpId,
            counterpartyErpId: input.counterpartyErpId,
            contractErpId: input.contractErpId,
            counterpartyId: refs.counterparties.get(input.counterpartyErpId) ?? null,
            contractId: refs.contracts.get(input.contractErpId) ?? null,
            currency: input.currency,
            openingDate: input.openingDate,
            openingBalance: toMinorUnits(input.openingBalance),
            closingBalance: toMinorUnits(input.closingBalance),
            isDeleted: false,
            sourceVersion: input.version,
        };
        if (existing) await repo.update(existing.id, fields);
        else await repo.save(repo.create({ balanceKey: input.key, ...fields }));
        return 'applied';
    }
}
