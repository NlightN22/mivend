import { Injectable, Logger } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import './types';
import type { ErpOrderStatus, ErpStatusUpdatePayload } from './types';

@Injectable()
export class ErpOrderService {
    private readonly logger = new Logger(ErpOrderService.name);

    constructor(private readonly connection: TransactionalConnection) {}

    async onOrderPlaced(ctx: RequestContext, order: Order): Promise<void> {
        order.customFields.erpStatus = 'PENDING';
        order.customFields.erpStatusAt = new Date();
        await this.connection.getRepository(ctx, Order).save(order);
        await this.sendToErp(ctx, order);
    }

    async updateStatus(ctx: RequestContext, payload: ErpStatusUpdatePayload): Promise<void> {
        const order = await this.connection.rawConnection
            .getRepository(Order)
            .createQueryBuilder('order')
            .where('order.customFieldsErporderid = :id', { id: payload.erpOrderId })
            .getOne();

        if (!order) {
            this.logger.warn(`updateStatus: order not found for erpOrderId=${payload.erpOrderId}`);
            return;
        }

        order.customFields.erpStatus = payload.status;
        order.customFields.erpStatusAt = new Date();
        await this.connection.rawConnection.getRepository(Order).save(order);
        this.logger.log(`Order ${order.code} status → ${payload.status}`);
    }

    // TODO Phase 2: write to outbox and publish via RabbitMQ
    private async sendToErp(ctx: RequestContext, order: Order): Promise<void> {
        order.customFields.erpStatus = 'SENT_TO_ERP' as ErpOrderStatus;
        order.customFields.erpStatusAt = new Date();
        await this.connection.getRepository(ctx, Order).save(order);
        this.logger.log(`Order ${order.code} sent to ERP (stub)`);
    }
}
