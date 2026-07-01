import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequestContextService } from '@vendure/core';
import { ErpOrderService } from './erp-order.service';
import type { ErpStatusUpdatePayload } from './types';

@Controller('erp/order')
export class ErpOrderController {
    constructor(
        private readonly service: ErpOrderService,
        private readonly requestContextService: RequestContextService,
    ) {}

    @Post('status')
    @HttpCode(200)
    async receiveStatus(
        @Req() req: Request,
        @Body() payload: ErpStatusUpdatePayload,
    ): Promise<{ ok: boolean }> {
        const ctx = await this.requestContextService.create({ apiType: 'admin', req });
        await this.service.updateStatus(ctx, payload);
        return { ok: true };
    }
}
