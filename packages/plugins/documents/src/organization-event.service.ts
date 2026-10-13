import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { ProformaInvoice } from '@mivend/plugin-acquiring';

import { loggerCtx } from './constants';
import { Document } from './entities/document.entity';
import { OrganizationRequisites } from './entities/organization-requisites.entity';
import { hasRequiredRequisites } from './requisites-completeness';
import { PdfGeneratorService } from './pdf/pdf-generator.service';

export const REQUISITE_FIELDS = [
    'inn',
    'kpp',
    'ogrn',
    'legalAddress',
    'bankName',
    'bankAccount',
    'bankBik',
    'correspondentAccount',
] as const;

export type RequisiteField = (typeof REQUISITE_FIELDS)[number];
export type RequisiteFields = Partial<Record<RequisiteField, string | null>>;

export interface OrganizationEventInput {
    legalName: string | null;
    isActive: boolean;
    fields: RequisiteFields;
}

// Applies the `organization` stream. An empty field means "not provided": it never wipes a
// stored value, a non-empty one always overwrites. Docs: docs/payments.md "Organizations".
@Injectable()
export class OrganizationEventService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly pdfGenerator: PdfGeneratorService,
    ) {}

    async upsertFromEvent(
        ctx: RequestContext,
        erpId: string,
        input: OrganizationEventInput,
    ): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, OrganizationRequisites);
        let entity = await repo.findOne({ where: { erpId } });
        const wasComplete = entity !== null && isComplete(entity);
        if (entity) {
            if (input.legalName) entity.legalName = input.legalName;
            entity.isActive = input.isActive;
        } else if (input.legalName) {
            entity = repo.create({ erpId, legalName: input.legalName, isActive: input.isActive });
        } else {
            return false;
        }
        for (const field of REQUISITE_FIELDS) {
            const value = input.fields[field];
            if (value) entity[field] = value;
        }
        const saved = await repo.save(entity);
        if (!wasComplete && isComplete(saved)) await this.retryFailedProformas(ctx, saved);
        return true;
    }

    private async retryFailedProformas(
        ctx: RequestContext,
        organization: OrganizationRequisites,
    ): Promise<void> {
        const failed = await this.connection
            .getRepository(ctx, Document)
            .createQueryBuilder('document')
            .select('document.id', 'id')
            .where('document.type = :type AND document.status = :status', {
                type: 'proforma-invoice',
                status: 'failed',
            })
            .andWhere(qb => {
                const sub = qb
                    .subQuery()
                    .select('CAST(pi.id AS varchar)')
                    .from(ProformaInvoice, 'pi')
                    .where('pi.organizationId = :organizationId')
                    .getQuery();
                return `document.proformaInvoiceId IN ${sub}`;
            })
            .setParameter('organizationId', Number(organization.id))
            .getRawMany<{ id: string }>();
        for (const { id } of failed) {
            const result = await this.connection
                .getRepository(ctx, Document)
                .update({ id, status: 'failed' }, { status: 'pending', metadata: null });
            if (result.affected) await this.pdfGenerator.enqueue(id);
        }
        if (failed.length) {
            Logger.info(
                `Requeued ${failed.length} failed proforma documents for organization ${organization.erpId}`,
                loggerCtx,
            );
        }
    }
}

function isComplete(requisites: OrganizationRequisites): boolean {
    return hasRequiredRequisites(requisites);
}
