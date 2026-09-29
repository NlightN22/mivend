import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import { Contract } from './entities/contract.entity';
import { loggerCtx } from './types';

// Fields from the `contract` Kafka stream (ContractChanged, issue #105) — `undefined` means "not
// sent, leave unchanged" on update; see upsertActiveState's own comment for the create-time
// tombstone exception, mirroring CounterpartyService.upsertActiveState's convention.
export interface ContractStreamFields {
    name: string | null;
    counterpartyId: string;
    organizationId: string;
    priceTypeId: string;
    isActive: boolean;
    creditLimit?: string | null;
    currency?: string | null;
    controlledIndividually?: boolean | null;
    debtDaysLimit?: number | null;
    contractKind: string;
    paymentKind?: string | null;
    paymentDelayDays?: number | null;
    contractType: string;
    brandManufacturerId?: string | null;
}

@Injectable()
export class ContractService {
    constructor(private connection: TransactionalConnection) {}

    // Mirrors CounterpartyService.upsertActiveState's shape — a tombstone (`fields.name: null`)
    // never carries a name, so a brand-new erpId with no name is deferred, not created; an
    // already-known row still gets its isActive/other fields updated.
    async upsertActiveState(
        ctx: RequestContext,
        erpId: string,
        fields: ContractStreamFields,
    ): Promise<void> {
        const repo = this.connection.getRepository(ctx, Contract);
        const entity = await repo.findOne({ where: { erpId } });
        if (entity) {
            if (fields.name) entity.name = fields.name;
            entity.counterpartyId = fields.counterpartyId;
            entity.organizationId = fields.organizationId;
            entity.priceTypeId = fields.priceTypeId;
            entity.isActive = fields.isActive;
            entity.contractKind = fields.contractKind;
            entity.contractType = fields.contractType;
            if (fields.creditLimit !== undefined) entity.creditLimit = fields.creditLimit;
            if (fields.currency !== undefined) entity.currency = fields.currency;
            if (fields.controlledIndividually !== undefined) {
                entity.controlledIndividually = fields.controlledIndividually;
            }
            if (fields.debtDaysLimit !== undefined) entity.debtDaysLimit = fields.debtDaysLimit;
            if (fields.paymentKind !== undefined) entity.paymentKind = fields.paymentKind;
            if (fields.paymentDelayDays !== undefined) {
                entity.paymentDelayDays = fields.paymentDelayDays;
            }
            if (fields.brandManufacturerId !== undefined) {
                entity.brandManufacturerId = fields.brandManufacturerId;
            }
            await repo.save(entity);
            return;
        }
        if (!fields.name) return;
        await repo.save(
            repo.create({
                erpId,
                name: fields.name,
                counterpartyId: fields.counterpartyId,
                organizationId: fields.organizationId,
                priceTypeId: fields.priceTypeId,
                isActive: fields.isActive,
                contractKind: fields.contractKind,
                contractType: fields.contractType,
                creditLimit: fields.creditLimit ?? null,
                currency: fields.currency ?? null,
                controlledIndividually: fields.controlledIndividually ?? null,
                debtDaysLimit: fields.debtDaysLimit ?? null,
                paymentKind: fields.paymentKind ?? null,
                paymentDelayDays: fields.paymentDelayDays ?? null,
                brandManufacturerId: fields.brandManufacturerId ?? null,
            }),
        );
        Logger.verbose(`Created contract erpId=${erpId} from Kafka stream`, loggerCtx);
    }

    async findByErpId(ctx: RequestContext, erpId: string): Promise<Contract | null> {
        return this.connection.getRepository(ctx, Contract).findOne({ where: { erpId } });
    }

    // #50's credit-gate: every active contract for a counterparty, regardless of
    // controlledIndividually — CreditLimitCheckService filters for the individually-controlled
    // ones itself.
    async findForCounterparty(ctx: RequestContext, counterpartyId: string): Promise<Contract[]> {
        return this.connection
            .getRepository(ctx, Contract)
            .find({ where: { counterpartyId, isActive: true } });
    }
}
