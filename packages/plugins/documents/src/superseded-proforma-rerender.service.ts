import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ProformaInvoice } from '@mivend/plugin-acquiring';

import { Document } from './entities/document.entity';

const MARKER = 'newerVersionRerender';

// Claims the one re-render that prints the "newer version" note on a superseded proforma's PDF.
@Injectable()
export class SupersededProformaRerenderService {
    constructor(private connection: TransactionalConnection) {}

    async claim(ctx: RequestContext, proformaInvoiceId: ID): Promise<Document | null> {
        return this.connection.withTransaction(ctx, async txCtx => {
            const repo = this.connection.getRepository(txCtx, Document);
            const document = await repo.findOne({
                where: { type: 'proforma-invoice', proformaInvoiceId: String(proformaInvoiceId) },
                lock: { mode: 'pessimistic_write' },
            });
            if (!document || document.metadata?.[MARKER] === true) return null;
            await repo.update(
                { id: document.id },
                { status: 'pending', metadata: { ...document.metadata, [MARKER]: true } },
            );
            return document;
        });
    }

    // Read after markReady committed: a render started before the supersede may land after the noted one.
    async missedNote(ctx: RequestContext, document: Document, noted: boolean): Promise<boolean> {
        if (noted || !document.proformaInvoiceId) return false;
        const invoice = await this.connection
            .getRepository(ctx, ProformaInvoice)
            .findOne({ where: { id: Number(document.proformaInvoiceId) } });
        return invoice?.status === 'superseded';
    }
}
