import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { RequestContext, TransactionalConnection } from '@vendure/core';

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
}
