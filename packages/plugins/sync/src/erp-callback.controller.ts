import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { EventBus, RequestContextService } from '@vendure/core';
import { ErpOrderStatusEvent } from '@mivend/plugin-erp-order';
import type { ErpOrderStatus } from '@mivend/plugin-erp-order';
import { ErpStatusUpdateDto } from './dto/erp-status-update.dto';

@ApiTags('ERP Callback')
@Controller('erp/callback')
export class ErpCallbackController {
    constructor(
        private readonly eventBus: EventBus,
        private readonly requestContextService: RequestContextService,
    ) {}

    @Post('order-status')
    @HttpCode(200)
    @ApiOperation({ summary: 'Receive an order status update pushed from the ERP (1C)' })
    @ApiBody({ type: ErpStatusUpdateDto })
    @ApiResponse({ status: 200, schema: { example: { ok: true } } })
    async receiveOrderStatus(
        @Req() req: Request,
        @Body() payload: ErpStatusUpdateDto,
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
