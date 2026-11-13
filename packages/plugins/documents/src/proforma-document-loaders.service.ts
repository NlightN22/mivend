import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { CtxLoader, findBounded } from 'shared';
import { In } from 'typeorm';

import { Document } from './entities/document.entity';
import { OrganizationRequisites } from './entities/organization-requisites.entity';

// Proforma invoice lists resolve seller and document per row; sellers repeat across rows.
@Injectable()
export class ProformaDocumentLoaders {
    private sellers = new CtxLoader<OrganizationRequisites>((ctx, keys) =>
        this.loadSellers(ctx, keys),
    );
    private documents = new CtxLoader<Document | null>((ctx, keys) =>
        this.loadDocuments(ctx, keys),
    );

    constructor(private connection: TransactionalConnection) {}

    seller(ctx: RequestContext, organizationId: number): Promise<OrganizationRequisites> {
        return this.sellers.load(ctx, organizationId);
    }

    document(ctx: RequestContext, proformaInvoiceId: number | string): Promise<Document | null> {
        return this.documents.load(ctx, proformaInvoiceId);
    }

    private async loadSellers(
        ctx: RequestContext,
        keys: readonly string[],
    ): Promise<Array<OrganizationRequisites | Error>> {
        const rows = await this.connection
            .getRepository(ctx, OrganizationRequisites)
            .find({ where: { id: In(keys.map(Number)) } });
        const byId = new Map(rows.map(row => [String(row.id), row]));
        return keys.map(
            key => byId.get(key) ?? new Error(`OrganizationRequisites ${key} not found`),
        );
    }

    private async loadDocuments(
        ctx: RequestContext,
        keys: readonly string[],
    ): Promise<Array<Document | null>> {
        // One document per invoice normally; five per key leaves room for regenerated copies.
        const rows = await findBounded(
            this.connection.getRepository(ctx, Document),
            {
                where: { type: 'proforma-invoice', proformaInvoiceId: In([...keys]) },
                order: { id: 'ASC' },
            },
            Math.max(keys.length * 5, 1),
        );
        const byInvoice = new Map<string, Document>();
        for (const row of rows) {
            if (row.proformaInvoiceId && !byInvoice.has(row.proformaInvoiceId)) {
                byInvoice.set(row.proformaInvoiceId, row);
            }
        }
        return keys.map(key => byInvoice.get(key) ?? null);
    }
}
