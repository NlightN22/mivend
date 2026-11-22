import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { Counterparty, TradingPoint } from '@mivend/plugin-counterparty';
import { In } from 'typeorm';

import type { OrderDimension } from './order-metrics.types';

interface LabelSource {
    entity: string | (new () => object);
    label: (row: Record<string, string | null>) => string | null;
}

const SOURCES: Partial<Record<OrderDimension, LabelSource>> = {
    CUSTOMER: { entity: Counterparty, label: r => r.shortName || r.legalName },
    POINT_OF_SALE: { entity: TradingPoint, label: r => r.name },
    MANAGER: { entity: 'ErpUser', label: r => r.fullName },
    ORGANIZATION: { entity: 'OrganizationRequisites', label: r => r.legalName },
};

// A name is a convenience: an id the mivend data does not know is shown as is.
@Injectable()
export class OrderAnalyticsLabelsService {
    constructor(private readonly connection: TransactionalConnection) {}

    async labelsFor(
        ctx: RequestContext,
        dimension: OrderDimension,
        ids: string[],
    ): Promise<Map<string, string>> {
        const source = SOURCES[dimension];
        const labels = new Map<string, string>();
        if (!source || ids.length === 0) return labels;
        const rows = (await this.connection
            .getRepository(ctx, source.entity as never)
            .find({ where: { erpId: In(ids) } as never, take: ids.length })) as Array<
            Record<string, string | null>
        >;
        for (const row of rows) {
            const label = source.label(row);
            if (row.erpId && label) labels.set(row.erpId, label);
        }
        return labels;
    }
}
