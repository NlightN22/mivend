import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import { Contract } from './entities/contract.entity';
import { loggerCtx } from './types';

// Fields from the `contract` Kafka stream (ContractChanged, issue #105) — `undefined` means "not
// sent, leave unchanged" on update, mirroring CounterpartyService.upsertActiveState.
export interface ContractStreamFields {
    name: string | null;
    counterpartyId: string;
    organizationId: string;
    priceTypeId: string;
    isActive: boolean;
    creditLimit?: string | null;
    currency?: string | null;
    // Always resolved by the caller (proto3 zero-value omission — absent means false/null, never
    // "leave unchanged"), same treatment as isActive above.
    controlledIndividually: boolean;
    debtDaysLimit: number | null;
    contractKind: string;
    paymentKind?: string | null;
    paymentDelayDays: number | null;
    contractType: string;
    brandManufacturerId?: string | null;
}

@Injectable()
export class ContractService {
    constructor(private connection: TransactionalConnection) {}

    // Mirrors CounterpartyService.upsertActiveState — a new erpId with no name is deferred, not
    // created; an already-known row still gets updated.
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
            entity.controlledIndividually = fields.controlledIndividually;
            entity.debtDaysLimit = fields.debtDaysLimit;
            if (fields.paymentKind !== undefined) entity.paymentKind = fields.paymentKind;
            entity.paymentDelayDays = fields.paymentDelayDays;
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
                controlledIndividually: fields.controlledIndividually,
                debtDaysLimit: fields.debtDaysLimit,
                paymentKind: fields.paymentKind ?? null,
                paymentDelayDays: fields.paymentDelayDays,
                brandManufacturerId: fields.brandManufacturerId ?? null,
            }),
        );
        Logger.verbose(`Created contract erpId=${erpId} from Kafka stream`, loggerCtx);
    }

    async findByErpId(ctx: RequestContext, erpId: string): Promise<Contract | null> {
        return this.connection.getRepository(ctx, Contract).findOne({ where: { erpId } });
    }

    // Issue #102: resolves a Contract by its mivend internal id for a GraphQL ID input arg.
    // No visibility filter — callers must constrain results by an already-visible Counterparty.
    async findById(ctx: RequestContext, id: ID): Promise<Contract | null> {
        return this.connection.getRepository(ctx, Contract).findOne({ where: { id } });
    }

    // A tombstone never carries a counterpartyId either — deactivate by erpId only, never look up
    // or overwrite other fields (same class of bug as the point-of-sale #100 tombstone fix).
    async deactivateTombstone(ctx: RequestContext, erpId: string): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, Contract);
        const entity = await repo.findOne({ where: { erpId } });
        if (!entity) return false;
        entity.isActive = false;
        await repo.save(entity);
        return true;
    }
}
