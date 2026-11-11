import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Permission } from '@vendure/common/lib/generated-types';
import { RequestContext } from '@vendure/core';
import { CustomPermission } from '@mivend/plugin-access-control';
import { StaffSearchRegistry, type GlobalSearchHit } from '@mivend/plugin-staff-search';

import { ProformaInvoiceVisibilityService } from './proforma-invoice-visibility.service';

export const PROFORMA_SEARCH_KIND = 'proformaInvoice';

@Injectable()
export class ProformaInvoiceSearchProvider implements OnApplicationBootstrap {
    constructor(
        private readonly registry: StaffSearchRegistry,
        private readonly visibility: ProformaInvoiceVisibilityService,
    ) {}

    onApplicationBootstrap(): void {
        this.registry.register({
            kind: PROFORMA_SEARCH_KIND,
            position: 30,
            permissions: [CustomPermission.ReadProformaInvoice.Permission as Permission],
            search: (ctx, term, limit) => this.search(ctx, term, limit),
        });
    }

    async search(ctx: RequestContext, term: string, limit: number): Promise<GlobalSearchHit[]> {
        const rows = await this.visibility.searchByNumber(ctx, term, limit);
        return rows.map(r => ({
            id: String(r.id),
            number: r.number,
            title: r.number,
            subtitle: r.counterpartyShortName,
            status: r.status,
            counterpartyId: r.counterpartyId == null ? null : String(r.counterpartyId),
        }));
    }
}
