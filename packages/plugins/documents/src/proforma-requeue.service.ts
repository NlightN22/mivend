import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { ProformaInvoice } from '@mivend/plugin-acquiring';
import { keysetBatches } from 'shared';
import type { SelectQueryBuilder } from 'typeorm';

import { loggerCtx } from './constants';
import { Document } from './entities/document.entity';
import { PdfGeneratorService } from './pdf/pdf-generator.service';
import { unconfirmedVatError } from './pdf/proforma-invoice-vat';

// Metadata is a text column that may hold non-JSON; parse in code, never cast in SQL.
function metadataError(metadata: string | null): unknown {
    if (!metadata) return undefined;
    try {
        return (JSON.parse(metadata) as { error?: unknown } | null)?.error;
    } catch {
        return undefined;
    }
}

type FailedQb = SelectQueryBuilder<Document>;
interface FailedRow {
    id: string;
    metadata?: string | null;
}

// Requeues failed proforma documents once what made them fail is fixed. The conditional
// failed->pending update keeps two concurrent requeues from enqueuing the same document twice.
@Injectable()
export class ProformaRequeueService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly pdfGenerator: PdfGeneratorService,
    ) {}

    async requeueForOrganization(
        ctx: RequestContext,
        organizationId: number,
        label: string,
    ): Promise<void> {
        for await (const failed of this.failedBatches(ctx, qb =>
            qb
                .andWhere(inner => {
                    const sub = inner
                        .subQuery()
                        .select('CAST(pi.id AS varchar)')
                        .from(ProformaInvoice, 'pi')
                        .where('pi.organizationId = :organizationId')
                        .getQuery();
                    return `document.proformaInvoiceId IN ${sub}`;
                })
                .setParameter('organizationId', organizationId),
        )) {
            await this.requeue(ctx, failed, `organization ${label}`);
        }
    }

    async requeueForUnconfirmedVat(ctx: RequestContext, categoryName: string): Promise<void> {
        const expected = unconfirmedVatError(categoryName);
        for await (const rows of this.failedBatches(ctx, qb =>
            qb.addSelect('document.metadata', 'metadata'),
        )) {
            const failed = rows.filter(row => metadataError(row.metadata ?? null) === expected);
            await this.requeue(ctx, failed, `VAT category ${categoryName}`);
        }
    }

    // Slices by id so a large backlog is requeued in full, never cut off or refused.
    private failedBatches(
        ctx: RequestContext,
        refine: (qb: FailedQb) => FailedQb,
    ): AsyncGenerator<FailedRow[]> {
        return keysetBatches<FailedRow>(async (afterId, limit) => {
            const qb = refine(this.failedProformas(ctx));
            if (afterId !== null) qb.andWhere('document.id > :afterId', { afterId });
            return qb.orderBy('document.id', 'ASC').limit(limit).getRawMany<FailedRow>();
        });
    }

    private failedProformas(ctx: RequestContext): FailedQb {
        return this.connection
            .getRepository(ctx, Document)
            .createQueryBuilder('document')
            .select('document.id', 'id')
            .where('document.type = :type AND document.status = :status', {
                type: 'proforma-invoice',
                status: 'failed',
            });
    }

    private async requeue(
        ctx: RequestContext,
        failed: { id: string }[],
        label: string,
    ): Promise<void> {
        for (const { id } of failed) {
            const result = await this.connection
                .getRepository(ctx, Document)
                .update({ id, status: 'failed' }, { status: 'pending', metadata: null });
            if (!result.affected) continue;
            try {
                await this.pdfGenerator.enqueue(id);
            } catch (err) {
                // No sweep picks up `pending` documents: put it back to failed so the next event retries it.
                await this.connection
                    .getRepository(ctx, Document)
                    .update({ id, status: 'pending' }, { status: 'failed' });
                throw err;
            }
        }
        if (failed.length) {
            Logger.info(
                `Requeued ${failed.length} failed proforma documents for ${label}`,
                loggerCtx,
            );
        }
    }
}
