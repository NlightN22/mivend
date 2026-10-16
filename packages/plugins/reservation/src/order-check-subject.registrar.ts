import { Injectable, OnModuleInit } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { CheckRegistry } from '@mivend/plugin-checks';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';

import { ORDER_CHECK_STAGES, ORDER_SUBJECT_TYPE, orderLockKey } from './order-check-subject';
import type { OrderCheckSubject } from './order-check-subject';
import { OrderCheckSubjectLoader } from './order-check-subject-loader.service';

// No `block` and no `require-approval` for a placed order: it is always accepted (#237). `block` is
// allowed on `cart` only, for input validation (a quantity that breaks the pack multiple is refused).
@Injectable()
export class OrderCheckSubjectRegistrar implements OnModuleInit {
    constructor(
        private registry: CheckRegistry,
        private loader: OrderCheckSubjectLoader,
        private visibility: OrderVisibilityService,
    ) {}

    onModuleInit(): void {
        this.registry.registerSubjectType<OrderCheckSubject>({
            type: ORDER_SUBJECT_TYPE,
            stages: ORDER_CHECK_STAGES,
            allowedConsequences: ['info', 'warn', 'hold'],
            stageConsequences: { cart: ['block'] },
            branchId: subject => subject.branchId,
            loadSubject: (ctx, orderId) => this.loader.load(ctx, orderId),
            lockKey: orderLockKey,
            dataVersion: subject =>
                `${subject.warehouseErpId ?? ''}:${subject.lines.map(l => `${l.lineId}x${l.quantity}`).join(',')}`,
            visibleSubjectIds: (ctx, ids) => this.visibleIds(ctx, ids),
        });
    }

    async visibleIds(ctx: RequestContext, ids: string[]): Promise<Set<string>> {
        const numeric = ids.filter(id => /^\d+$/.test(id));
        if (numeric.length === 0) return new Set();
        const qb = await this.visibility.buildVisibleOrdersQuery(ctx);
        const rows = await qb
            .andWhere(`${qb.alias}.id IN (:...ids)`, { ids: numeric })
            .select(`${qb.alias}.id`)
            .getMany();
        return new Set(rows.map(o => String(o.id)));
    }
}
