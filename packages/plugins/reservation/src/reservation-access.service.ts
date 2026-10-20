import { Injectable } from '@nestjs/common';
import type { ID } from '@vendure/common/lib/shared-types';
import { Order, RequestContext, UserInputError } from '@vendure/core';
import { AccessScopeService, CustomPermission } from '@mivend/plugin-access-control';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';

// Backend scope guards for staff reads: a permission alone never exposes another scope's data.
@Injectable()
export class ReservationAccessService {
    constructor(
        private readonly visibility: OrderVisibilityService,
        private readonly accessScope: AccessScopeService,
    ) {}

    async findVisibleOrder(ctx: RequestContext, orderId: ID): Promise<Order> {
        const qb = await this.visibility.buildVisibleOrdersQuery(ctx);
        const order = await qb.andWhere(`${qb.alias}.id = :orderId`, { orderId }).getOne();
        if (!order) throw new UserInputError('Order not found');
        return order;
    }

    // Own role limits only, unless the caller manages access control.
    async canReadExtensionLimit(ctx: RequestContext, roleCode: string): Promise<boolean> {
        if (ctx.userHasPermissions([CustomPermission.ManageAccessControl.Permission])) return true;
        const { roleCodes } = await this.accessScope.getActorIdentity(ctx);
        return roleCodes.includes(roleCode);
    }
}
