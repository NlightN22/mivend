import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

import { OrganizationRequisites } from './entities/organization-requisites.entity';
import { hasRequiredRequisites } from './requisites-completeness';
import { ProformaRequeueService } from './proforma-requeue.service';

export const REQUISITE_FIELDS = [
    'inn',
    'kpp',
    'ogrn',
    'legalAddress',
    'bankName',
    'bankAccount',
    'bankBik',
    'correspondentAccount',
    'phone',
] as const;

export type RequisiteField = (typeof REQUISITE_FIELDS)[number];
export type RequisiteFields = Partial<Record<RequisiteField, string | null>>;

export interface OrganizationEventInput {
    legalName: string | null;
    isActive?: boolean;
    controlsStock?: boolean;
    fields: RequisiteFields;
    // Absent keeps the stored id: the bank requisites are derived from it by the integration plugin.
    mainBankAccountId?: string | null;
}

// Requisites that arrive from other streams (contact set, bank chain); a missing key is left alone.
export type DerivedRequisites = Partial<
    Record<
        'legalAddress' | 'phone' | 'bankName' | 'bankAccount' | 'bankBik' | 'correspondentAccount',
        string | null
    >
>;

// Applies the `organization` stream. Legal requisites are sticky: an empty one never wipes a stored value.
@Injectable()
export class OrganizationEventService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly requeue: ProformaRequeueService,
    ) {}

    async upsertFromEvent(
        ctx: RequestContext,
        erpId: string,
        input: OrganizationEventInput,
    ): Promise<boolean> {
        const saved = await withAggregateLock(
            this.connection,
            ctx,
            `organization-requisites:${erpId}`,
            txCtx => this.applyUnderLock(txCtx, erpId, input),
        );
        if (!saved) return false;
        // Every event of a complete organization retries failed documents, so a failed requeue is picked up again.
        if (isComplete(saved)) {
            await this.requeue.requeueForOrganization(ctx, Number(saved.id), saved.erpId);
        }
        return true;
    }

    // Read under the lock; save() writes only the columns that changed.
    private async applyUnderLock(
        ctx: RequestContext,
        erpId: string,
        input: OrganizationEventInput,
    ): Promise<OrganizationRequisites | null> {
        const repo = this.connection.getRepository(ctx, OrganizationRequisites);
        let entity = await repo.findOne({ where: { erpId } });
        if (entity) {
            if (input.legalName) entity.legalName = input.legalName;
            if (input.isActive !== undefined) entity.isActive = input.isActive;
        } else if (input.legalName) {
            entity = repo.create({
                erpId,
                legalName: input.legalName,
                isActive: input.isActive ?? false,
                controlsStock: null,
            });
        } else {
            return null;
        }
        if (input.controlsStock !== undefined) entity.controlsStock = input.controlsStock;
        for (const field of REQUISITE_FIELDS) {
            const value = input.fields[field];
            if (value) entity[field] = value;
        }
        if (input.mainBankAccountId !== undefined)
            entity.mainBankAccountId = input.mainBankAccountId;
        return repo.save(entity);
    }

    // The phone is the full state of the contact set (empty clears); address and bank requisites stay sticky.
    async applyDerived(
        ctx: RequestContext,
        erpId: string,
        patch: DerivedRequisites,
    ): Promise<boolean> {
        const saved = await withAggregateLock(
            this.connection,
            ctx,
            `organization-requisites:${erpId}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, OrganizationRequisites);
                const entity = await repo.findOne({ where: { erpId } });
                if (!entity) return null;
                for (const [field, value] of Object.entries(patch) as [
                    keyof DerivedRequisites,
                    string | null | undefined,
                ][]) {
                    if (field === 'phone' ? value !== undefined : value)
                        entity[field] = value ?? null;
                }
                return repo.save(entity);
            },
        );
        if (!saved) return false;
        if (isComplete(saved))
            await this.requeue.requeueForOrganization(ctx, Number(saved.id), saved.erpId);
        return true;
    }
}

function isComplete(requisites: OrganizationRequisites): boolean {
    return hasRequiredRequisites(requisites);
}
