import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Logger,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { SelectQueryBuilder } from 'typeorm';
import {
    ctxQuery,
    documentNumberSearchTerm,
    findBounded,
    getPageAndCount,
    getRawManyBounded,
} from 'shared';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import { ProformaInvoice } from '@mivend/plugin-acquiring';

import { loggerCtx } from './constants';
import { Document } from './entities/document.entity';
import {
    OrganizationRequisites,
    CompleteOrganizationRequisites,
} from './entities/organization-requisites.entity';
import { missingRequiredRequisites } from './requisites-completeness';
import { DocumentRecord, OrganizationRequisitesRecord } from './types';

export interface DocumentListOptions {
    take?: number;
    skip?: number;
    type?: string;
    // Exact match, unlike `type` (ILike): options come from a checklist of real DB values,
    // not free text, so exact match is correct. If `type` and `types` are both set, `types` wins.
    types?: string[];
    status?: string;
    search?: string;
}

@Injectable()
export class DocumentsService {
    constructor(
        private connection: TransactionalConnection,
        private counterpartyService: CounterpartyService,
    ) {}

    async findForCounterparty(
        ctx: RequestContext,
        counterpartyId: ID,
        options?: DocumentListOptions,
    ): Promise<PaginatedList<Document>> {
        const take = options?.take ?? 50;
        const skip = options?.skip ?? 0;

        const qb = this.connection
            .getRepository(ctx, Document)
            .createQueryBuilder('document')
            .where('document.counterpartyId = :counterpartyId', {
                counterpartyId: String(counterpartyId),
            })
            .orderBy('document.issueDate', 'DESC')
            .addOrderBy('document.id', 'DESC');

        if (options?.type) {
            qb.andWhere('document.type = :type', { type: options.type });
        }
        if (options?.search) {
            qb.andWhere('document.number ILIKE :term', {
                term: documentNumberSearchTerm(options.search),
            });
        }

        return getPageAndCount(qb, take, skip);
    }

    // Visibility derives from counterparty visibility, embedded as a subquery (never a materialized id list).
    private async visibleDocumentsQb(
        ctx: RequestContext,
        counterpartyId?: ID,
    ): Promise<SelectQueryBuilder<Document>> {
        const qb = this.connection.getRepository(ctx, Document).createQueryBuilder('document');
        const visible = await this.counterpartyService.visibleIdsSql(ctx);
        if (visible) {
            qb.where(`document.counterpartyId IN (${visible.sql})`, visible.params);
        }
        if (counterpartyId !== undefined) {
            // Intersect, never replace, the visibility scope: an id outside it yields an empty result.
            qb.andWhere('document.counterpartyId = :requestedCounterpartyId', {
                requestedCounterpartyId: String(counterpartyId),
            });
        }
        return qb;
    }

    async findVisible(
        ctx: RequestContext,
        options?: DocumentListOptions,
        counterpartyId?: ID,
        orderId?: ID,
    ): Promise<PaginatedList<Document>> {
        const qb = await this.visibleDocumentsQb(ctx, counterpartyId);
        if (orderId !== undefined) {
            qb.andWhere('document.orderId = :orderId', { orderId: String(orderId) });
        }
        // ILIKE, not exact: `type` is free-text ERP data and the portal shows a text box.
        if (options?.types?.length) {
            qb.andWhere('document.type IN (:...types)', { types: options.types });
        } else if (options?.type) {
            qb.andWhere('document.type ILIKE :type', { type: `%${options.type}%` });
        }
        if (options?.status) {
            qb.andWhere('document.status = :status', { status: options.status });
        }
        if (options?.search) {
            qb.andWhere('document.number ILIKE :term', {
                term: documentNumberSearchTerm(options.search),
            });
        }
        qb.orderBy('document.issueDate', 'DESC').addOrderBy('document.id', 'DESC');
        return getPageAndCount(qb, options?.take ?? 50, options?.skip ?? 0);
    }

    // Bounded server-side DISTINCT over the scoped rows (not fetch-all and dedupe in JS).
    async findVisibleTypes(ctx: RequestContext, counterpartyId?: ID): Promise<string[]> {
        const rows = await getRawManyBounded<{ type: string }>(
            (await this.visibleDocumentsQb(ctx, counterpartyId))
                .select('document.type', 'type')
                .distinct(true)
                .orderBy('document.type', 'ASC'),
        );
        return rows.map(r => r.type);
    }

    async upsertFromErp(ctx: RequestContext, record: DocumentRecord): Promise<Document> {
        const counterparty = await this.counterpartyService.findByErpId(
            ctx,
            record.counterpartyErpId,
        );
        if (!counterparty) {
            throw new UserInputError(`Counterparty not found: erpId=${record.counterpartyErpId}`);
        }
        const orderId = record.orderErpId
            ? await this.findOrderIdByErpId(ctx, record.orderErpId)
            : null;

        const repo = this.connection.getRepository(ctx, Document);
        let entity = await repo.findOne({ where: { erpId: record.erpId } });
        const input = {
            erpId: record.erpId,
            type: record.type,
            counterpartyId: String(counterparty.id),
            orderId,
            number: record.number,
            issueDate: new Date(record.issueDate),
            amount: record.amount ?? null,
            currencyCode: record.currencyCode ?? null,
            status: 'ready' as const,
            source: 'erp' as const,
            fileUrl: record.fileUrl ?? null,
            metadata: record.metadata ?? null,
        };
        if (entity) {
            Object.assign(entity, input);
        } else {
            entity = repo.create(input);
        }
        const saved = await repo.save(entity);
        Logger.verbose(`Upserted document erpId=${record.erpId}`, loggerCtx);
        return saved;
    }

    // PdfGeneratorService's guard: a partial row (created from the organization stream's name alone)
    // must never produce a document with blank legal fields. Address/kpp/phone are optional.
    assertRequisitesComplete(
        requisites: OrganizationRequisites,
    ): asserts requisites is CompleteOrganizationRequisites {
        const missing = missingRequiredRequisites(requisites);
        if (missing.length > 0) {
            throw new Error(
                `Cannot generate a document for organization erpId=${requisites.erpId}: ` +
                    `missing required requisites (${missing.join(', ')}) — awaiting the organization stream or erp-import's full record.`,
            );
        }
    }

    async upsertRequisites(
        ctx: RequestContext,
        record: OrganizationRequisitesRecord,
    ): Promise<OrganizationRequisites> {
        const repo = this.connection.getRepository(ctx, OrganizationRequisites);
        let entity = await repo.findOne({ where: { erpId: record.erpId } });
        if (entity) {
            Object.assign(entity, record);
        } else {
            entity = repo.create(record);
        }
        return repo.save(entity);
    }

    // Logo is admin-set, never ERP-pushed (see entity comment) — a dedicated
    // method keeps this update from ever going through the ERP upsert path.
    async setLogo(
        ctx: RequestContext,
        erpId: string,
        assetId: ID,
    ): Promise<OrganizationRequisites> {
        const repo = this.connection.getRepository(ctx, OrganizationRequisites);
        const entity = await repo.findOne({ where: { erpId } });
        if (!entity) {
            throw new UserInputError(`OrganizationRequisites not found: erpId=${erpId}`);
        }
        entity.logoAssetId = String(assetId);
        return repo.save(entity);
    }

    // Seed/admin-only: maps an ERP org erpId to the platform's auto-increment id, e.g. to fill
    // ProductVariant.customFields.organizationId before a real ERP export exists.
    async findAllRequisites(ctx: RequestContext): Promise<OrganizationRequisites[]> {
        return findBounded(this.connection.getRepository(ctx, OrganizationRequisites));
    }

    // Takes the ERP's GUID (erpId), not the platform's auto-increment id; the two are not
    // interchangeable.
    async findRequisitesIdByErpId(ctx: RequestContext, erpId: string): Promise<number | null> {
        const entity = await this.connection
            .getRepository(ctx, OrganizationRequisites)
            .findOne({ where: { erpId } });
        return entity ? Number(entity.id) : null;
    }

    // Per-organization requisites for one proforma invoice. getActiveRequisites() is only the
    // single-organization fallback for documents that predate per-organization splitting.
    async getRequisitesById(
        ctx: RequestContext,
        organizationId: number,
    ): Promise<OrganizationRequisites> {
        const requisites = await this.connection
            .getRepository(ctx, OrganizationRequisites)
            .findOne({ where: { id: organizationId } });
        if (!requisites) {
            throw new Error(`OrganizationRequisites ${organizationId} not found`);
        }
        return requisites;
    }

    async getActiveRequisites(ctx: RequestContext): Promise<OrganizationRequisites> {
        const requisites = await this.connection
            .getRepository(ctx, OrganizationRequisites)
            .findOne({ where: { isActive: true } });
        if (!requisites) {
            throw new Error('No active OrganizationRequisites found — cannot render a document');
        }
        return requisites;
    }

    // Placeholder row is written synchronously so the customer sees "generating" at once;
    // PDF enqueue stays with the caller to avoid a DocumentsService <-> PdfGeneratorService cycle.
    async createProformaInvoicePlaceholder(
        ctx: RequestContext,
        proformaInvoice: ProformaInvoice,
    ): Promise<{ document: Document; created: boolean }> {
        const repo = this.connection.getRepository(ctx, Document);
        const existing = await repo.findOne({
            where: { type: 'proforma-invoice', proformaInvoiceId: String(proformaInvoice.id) },
        });
        if (existing) return { document: existing, created: false };
        const entity = repo.create({
            type: 'proforma-invoice',
            counterpartyId: String(proformaInvoice.counterpartyId),
            orderId: proformaInvoice.orderId == null ? null : String(proformaInvoice.orderId),
            proformaInvoiceId: String(proformaInvoice.id),
            number: proformaInvoice.number,
            issueDate: proformaInvoice.issuedAt,
            amount: proformaInvoice.amount,
            currencyCode: proformaInvoice.currencyCode,
            status: 'pending' as const,
            source: 'generated' as const,
            erpId: null,
            fileUrl: null,
            metadata: null,
        });
        const saved = await repo.save(entity);
        Logger.verbose(`Created proforma invoice placeholder ${proformaInvoice.number}`, loggerCtx);
        return { document: saved, created: true };
    }

    async findForProformaInvoice(
        ctx: RequestContext,
        proformaInvoiceId: ID,
    ): Promise<Document | null> {
        return this.connection.getRepository(ctx, Document).findOne({
            where: { type: 'proforma-invoice', proformaInvoiceId: String(proformaInvoiceId) },
        });
    }

    async createContractPlaceholder(ctx: RequestContext, counterpartyId: ID): Promise<Document> {
        const repo = this.connection.getRepository(ctx, Document);
        const entity = repo.create({
            type: 'contract',
            counterpartyId: String(counterpartyId),
            orderId: null,
            number: `CTR-${Date.now()}`,
            issueDate: new Date(),
            amount: null,
            currencyCode: null,
            status: 'pending' as const,
            source: 'generated' as const,
            erpId: null,
            fileUrl: null,
            metadata: null,
        });
        const saved = await repo.save(entity);
        Logger.verbose(
            `Created contract placeholder for counterparty ${counterpartyId}`,
            loggerCtx,
        );
        return saved;
    }

    async markGenerating(ctx: RequestContext, documentId: ID): Promise<void> {
        await this.connection
            .getRepository(ctx, Document)
            .update(documentId, { status: 'generating' });
    }

    async markReady(ctx: RequestContext, documentId: ID): Promise<void> {
        await this.connection.getRepository(ctx, Document).update(documentId, { status: 'ready' });
    }

    async markFailed(ctx: RequestContext, documentId: ID, error: string): Promise<void> {
        Logger.error(`Document ${documentId} generation failed: ${error}`, loggerCtx);
        await this.connection.getRepository(ctx, Document).update(documentId, {
            status: 'failed',
            metadata: { error },
        });
    }

    async findOne(ctx: RequestContext, documentId: ID): Promise<Document | null> {
        return this.connection.getRepository(ctx, Document).findOne({ where: { id: documentId } });
    }

    // Order.customFields.erpOrderId comes from plugin-erp-order's module augmentation, which this
    // plugin's tsc build cannot see, so it is read via raw customFields (as in getForCustomer()).
    private async findOrderIdByErpId(
        ctx: RequestContext,
        erpOrderId: string,
    ): Promise<string | null> {
        const result = await ctxQuery<Array<{ id: string | number }>>(
            this.connection,
            ctx,
            `SELECT id FROM "order" WHERE "customFieldsErporderid" = $1 LIMIT 1`,
            [erpOrderId],
        );
        return result[0]?.id ? String(result[0].id) : null;
    }
}
