import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import {
    Logger,
    Order,
    PaginatedList,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { In } from 'typeorm';
import { CounterpartyService } from '@mivend/plugin-counterparty';

import { loggerCtx } from './constants';
import { Document } from './entities/document.entity';
import { OrganizationRequisites } from './entities/organization-requisites.entity';
import { DocumentRecord, OrganizationRequisitesRecord } from './types';

export interface DocumentListOptions {
    take?: number;
    skip?: number;
    type?: string;
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
            .take(take)
            .skip(skip);

        if (options?.type) {
            qb.andWhere('document.type = :type', { type: options.type });
        }
        if (options?.search) {
            qb.andWhere('document.number ILIKE :term', { term: `%${options.search}%` });
        }

        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    // Admin-facing document visibility is derived entirely from counterparty visibility — no
    // dedicated scope resolution here, per docs/access-control.md ("resources whose visibility
    // is derived from another resource... reuse the owning resource's scope resolution, do not
    // duplicate resolve<Resource>Scope logic"). Reuses CounterpartyService.findVisible()'s
    // already-scoped result directly rather than re-deriving own/department/all filtering.
    async findVisible(
        ctx: RequestContext,
        options?: DocumentListOptions,
    ): Promise<PaginatedList<Document>> {
        const visibleCounterparties = await this.counterpartyService.findVisible(ctx);
        const counterpartyIds = visibleCounterparties.map(c => String(c.id));
        if (counterpartyIds.length === 0) {
            return { items: [], totalItems: 0 };
        }
        const take = options?.take ?? 50;
        const skip = options?.skip ?? 0;
        const [items, totalItems] = await this.connection
            .getRepository(ctx, Document)
            .findAndCount({
                where: { counterpartyId: In(counterpartyIds) },
                order: { issueDate: 'DESC' },
                take,
                skip,
            });
        return { items, totalItems };
    }

    async upsertFromErp(ctx: RequestContext, record: DocumentRecord): Promise<Document> {
        const counterparty = await this.counterpartyService.findByErpId(
            ctx,
            record.counterpartyErpId,
        );
        if (!counterparty) {
            throw new UserInputError(`Counterparty not found: erpId=${record.counterpartyErpId}`);
        }
        const orderId = record.orderErpId ? await this.findOrderIdByErpId(record.orderErpId) : null;

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

    async getActiveRequisites(ctx: RequestContext): Promise<OrganizationRequisites> {
        const requisites = await this.connection
            .getRepository(ctx, OrganizationRequisites)
            .findOne({ where: { isActive: true } });
        if (!requisites) {
            throw new Error('No active OrganizationRequisites found — cannot render a document');
        }
        return requisites;
    }

    // Creates the placeholder row synchronously (customer sees "generating" right
    // away); actual PDF rendering is enqueued separately by the caller via
    // PdfGeneratorService.enqueue(document.id) — kept out of this service to avoid
    // a circular DI dependency between DocumentsService and PdfGeneratorService.
    async createInvoicePlaceholder(
        ctx: RequestContext,
        order: Order,
        counterpartyId: ID,
    ): Promise<Document> {
        const repo = this.connection.getRepository(ctx, Document);
        const entity = repo.create({
            type: 'invoice',
            counterpartyId: String(counterpartyId),
            orderId: String(order.id),
            number: order.code,
            issueDate: new Date(),
            amount: order.totalWithTax,
            currencyCode: order.currencyCode,
            status: 'pending' as const,
            source: 'generated' as const,
            erpId: null,
            fileUrl: null,
            assetId: null,
            metadata: null,
        });
        const saved = await repo.save(entity);
        Logger.verbose(`Created invoice placeholder for order ${order.code}`, loggerCtx);
        return saved;
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
            assetId: null,
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

    async markReady(ctx: RequestContext, documentId: ID, assetId: ID): Promise<void> {
        await this.connection
            .getRepository(ctx, Document)
            .update(documentId, { status: 'ready', assetId: String(assetId) });
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

    // Order.customFields.erpOrderId is declared by plugin-erp-order's module
    // augmentation, which isn't visible to this plugin's own tsc build — mirrors
    // the existing raw-customFields-join pattern in
    // packages/plugins/counterparty/src/counterparty.service.ts's getForCustomer().
    private async findOrderIdByErpId(erpOrderId: string): Promise<string | null> {
        const result = await this.connection.rawConnection.query(
            `SELECT id FROM "order" WHERE "customFieldsErporderid" = $1 LIMIT 1`,
            [erpOrderId],
        );
        return result[0]?.id ? String(result[0].id) : null;
    }
}
