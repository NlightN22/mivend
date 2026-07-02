import { Injectable, Logger } from '@nestjs/common';
import { EventBus, Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { OrderReadyForErpEvent } from './erp-order.events';
import './types';
import type { ErpStatusUpdatePayload } from './types';

@Injectable()
export class ErpOrderService {
    private readonly logger = new Logger(ErpOrderService.name);

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly eventBus: EventBus,
    ) {}

    async onOrderPlaced(ctx: RequestContext, order: Order): Promise<void> {
        order.customFields.erpStatus = 'PENDING';
        order.customFields.erpStatusAt = new Date();
        await this.connection.getRepository(ctx, Order).save(order);
        this.eventBus.publish(new OrderReadyForErpEvent(ctx, String(order.id), order.code));
    }

    async updateStatus(ctx: RequestContext, payload: ErpStatusUpdatePayload): Promise<void> {
        const order = await this.connection.rawConnection
            .getRepository(Order)
            .findOne({ where: { code: payload.orderCode } });

        if (!order) {
            this.logger.warn(`updateStatus: order not found for code=${payload.orderCode}`);
            return;
        }

        order.customFields.erpStatus = payload.status;
        order.customFields.erpStatusAt = new Date();
        if (payload.erpOrderId) {
            order.customFields.erpOrderId = payload.erpOrderId;
        }
        await this.connection.rawConnection.getRepository(Order).save(order);
        this.logger.log(`Order ${order.code} status → ${payload.status}`);
    }
}
