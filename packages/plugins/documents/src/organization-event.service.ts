import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

import {
    OrganizationRequisites,
    OrganizationSignatory,
} from './entities/organization-requisites.entity';
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
    fields: RequisiteFields;
    signatories?: OrganizationSignatory[];
}

// Applies the `organization` stream. An empty field means "not provided": it never wipes a
// stored value, a non-empty one always overwrites (signatories: the whole list). Docs: docs/payments.md "Organizations".
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
            });
        } else {
            return null;
        }
        for (const field of REQUISITE_FIELDS) {
            const value = input.fields[field];
            if (value) entity[field] = value;
        }
        if (input.signatories?.length) entity.signatories = input.signatories;
        return repo.save(entity);
    }
}

function isComplete(requisites: OrganizationRequisites): boolean {
    return hasRequiredRequisites(requisites);
}
