import { Injectable } from '@nestjs/common';
import {
    CustomerService,
    Permission,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import { CustomPermission } from '@mivend/plugin-access-control';

import { Document } from './entities/document.entity';
import { UUID_RE } from './pdf/document-pdf-storage.service';

// Missing and hidden documents both yield null, so the endpoint cannot be used to probe uuids.
@Injectable()
export class DocumentPdfAccessService {
    constructor(
        private connection: TransactionalConnection,
        private counterpartyService: CounterpartyService,
        private customerService: CustomerService,
    ) {}

    async findDownloadable(ctx: RequestContext, uuid: string): Promise<Document | null> {
        if (!ctx.activeUserId || !UUID_RE.test(uuid)) return null;
        const document = await this.connection
            .getRepository(ctx, Document)
            .findOne({ where: { uuid: uuid.toLowerCase(), source: 'generated' } });
        if (!document) return null;
        return (await this.canSee(ctx, document.counterpartyId)) ? document : null;
    }

    // Admin: the scope of the Admin `documents` query; anyone else: only the own counterparty.
    private async canSee(ctx: RequestContext, counterpartyId: string): Promise<boolean> {
        const isStaff =
            ctx.userHasPermissions([Permission.ReadCustomer]) ||
            ctx.userHasPermissions([CustomPermission.ReadCounterparty.Permission]);
        if (isStaff) {
            return (await this.counterpartyService.findOneVisible(ctx, counterpartyId)) !== null;
        }
        const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId!);
        if (!customer) return false;
        const own = await this.counterpartyService.getForCustomer(ctx, customer.id);
        return own !== null && String(own.id) === counterpartyId;
    }
}
