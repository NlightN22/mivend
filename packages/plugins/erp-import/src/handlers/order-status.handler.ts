import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { OrderStatusReferenceService } from '@mivend/plugin-erp-order';

import type { OrderStatusRecord } from '../types';

@Injectable()
export class OrderStatusHandler {
    constructor(private readonly references: OrderStatusReferenceService) {}

    async upsert(ctx: RequestContext, record: OrderStatusRecord): Promise<void> {
        await this.references.apply(ctx, { ...record, isDeleted: false });
    }
}
