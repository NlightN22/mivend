import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

import { ContractPowerOfAttorneyErp } from './entities/contract-power-of-attorney-erp.entity';

export interface PowerOfAttorneyErpItem {
    externalId: string | null;
    number: string;
    holderName: string;
    issueDate: Date | null;
    validUntil: Date | null;
    scanId: string | null;
}

export interface PowerOfAttorneyErpReplace {
    contractId: string;
    counterpartyId: string | null;
    organizationId: string | null;
    isDeleted: boolean;
    items: PowerOfAttorneyErpItem[];
}

@Injectable()
export class PowerOfAttorneyErpService {
    constructor(private readonly connection: TransactionalConnection) {}

    // A contract event is full state: its list replaces the stored one, an empty list clears it.
    replaceForContract(ctx: RequestContext, input: PowerOfAttorneyErpReplace): Promise<void> {
        return withAggregateLock(this.connection, ctx, lockKey(input.contractId), async txCtx => {
            const repo = this.connection.getRepository(txCtx, ContractPowerOfAttorneyErp);
            await repo.delete({ contractId: input.contractId });
            if (input.items.length === 0) return;
            await repo.insert(
                input.items.map(item => ({
                    ...item,
                    contractId: input.contractId,
                    counterpartyId: input.counterpartyId,
                    organizationId: input.organizationId,
                    isDeleted: input.isDeleted,
                })),
            );
        });
    }

    // A contract tombstone carries no list: the rows stay and only get the flag.
    markContractDeleted(ctx: RequestContext, contractId: string): Promise<void> {
        return withAggregateLock(this.connection, ctx, lockKey(contractId), async txCtx => {
            await this.connection
                .getRepository(txCtx, ContractPowerOfAttorneyErp)
                .update({ contractId }, { isDeleted: true });
        });
    }
}

const lockKey = (contractId: string): string => `contract-power-of-attorney:${contractId}`;
