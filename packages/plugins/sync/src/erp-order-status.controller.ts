import { Controller, Get, NotFoundException, Param, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequestContextService } from '@vendure/core';
import { ErpOrderService } from '@mivend/plugin-erp-order';
import { OrderErpStatusDto } from './dto/order-erp-status.dto';

// Complements ErpCallbackController's push path (POST order-status) — lets
// the ERP re-query current status on demand (e.g. after a missed callback,
// or for reconciliation) instead of relying solely on us pushing updates.
@ApiTags('ERP Callback')
@Controller('erp/orders')
export class ErpOrderStatusController {
    constructor(
        private readonly erpOrderService: ErpOrderService,
        private readonly requestContextService: RequestContextService,
    ) {}

    @Get(':orderCode/status')
    @ApiOperation({
        summary: 'Look up the current ERP status of an order by its Vendure order code',
    })
    @ApiParam({ name: 'orderCode', example: 'ORD-202607-28607FEA' })
    @ApiResponse({ status: 200, type: OrderErpStatusDto })
    @ApiResponse({ status: 404, description: 'No order exists with this orderCode.' })
    async getStatus(
        @Req() req: Request,
        @Param('orderCode') orderCode: string,
    ): Promise<OrderErpStatusDto> {
        const ctx = await this.requestContextService.create({ apiType: 'admin', req });
        const info = await this.erpOrderService.getStatus(ctx, orderCode);
        if (!info) {
            throw new NotFoundException(`No order found for orderCode=${orderCode}`);
        }
        return {
            orderCode: info.orderCode,
            status: info.status,
            erpOrderId: info.erpOrderId,
            updatedAt: info.updatedAt ? info.updatedAt.toISOString() : null,
        };
    }
}
