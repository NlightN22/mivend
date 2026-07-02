import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { EventBus, RequestContextService } from '@vendure/core';
import { ErpOrderStatusEvent } from '@mivend/plugin-erp-order';
import type { ErpOrderStatus, ErpStatusUpdatePayload } from '@mivend/plugin-erp-order';

@Controller('erp/callback')
export class ErpCallbackController {
    constructor(
        private readonly eventBus: EventBus,
        private readonly requestContextService: RequestContextService,
    ) {}

    @Post('order-status')
    @HttpCode(200)
    async receiveOrderStatus(
        @Req() req: Request,
        @Body() payload: ErpStatusUpdatePayload,
    ): Promise<{ ok: boolean }> {
        const ctx = await this.requestContextService.create({ apiType: 'admin', req });
        this.eventBus.publish(
            new ErpOrderStatusEvent(
                ctx,
                payload.orderCode,
                payload.status as ErpOrderStatus,
                payload.erpOrderId,
            ),
        );
        return { ok: true };
    }
}
