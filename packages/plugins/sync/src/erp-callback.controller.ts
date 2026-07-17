import { BadRequestException, Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { EventBus, RequestContextService } from '@vendure/core';
import { ErpOrderStatusEvent } from '@mivend/plugin-erp-order';
import type { ErpOrderStatus } from '@mivend/plugin-erp-order';
import { ErpStatusUpdateDto } from './dto/erp-status-update.dto';
import { ErpPaymentReportedDto } from './dto/erp-payment-reported.dto';
import { ErpPaymentReportedEvent } from './erp-payment.events';

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

    @Post('payment')
    @HttpCode(200)
    @ApiOperation({
        summary:
            'Receive a payment fact pushed from the ERP (1C) for an Invoice — durably ' +
            'enqueued by plugin-acquiring, never processed inline (AGENTS.md sync rule #12). ' +
            'Also the simulation entry point until a real ERP integration exists.',
    })
    @ApiBody({ type: ErpPaymentReportedDto })
    @ApiResponse({ status: 200, schema: { example: { ok: true } } })
    async receivePayment(
        @Req() req: Request,
        @Body() payload: ErpPaymentReportedDto,
    ): Promise<{ ok: boolean }> {
        // No global ValidationPipe is wired (this project doesn't use class-validator), so
        // @ApiProperty()'s "required" is Swagger-schema documentation only, not runtime
        // enforcement — check explicitly. erpEventId is the mandatory reconciliation requisite
        // (docs/payments.md); a payment fact without one is invalid input, rejected here rather
        // than silently accepted with a missing reference.
        if (!payload.erpEventId) {
            throw new BadRequestException('erpEventId is required');
        }
        if (!payload.organizationId) {
            throw new BadRequestException('organizationId is required');
        }
        const ctx = await this.requestContextService.create({ apiType: 'admin', req });
        this.eventBus.publish(
            new ErpPaymentReportedEvent(
                ctx,
                payload.invoiceId,
                payload.organizationId,
                payload.outcome,
                payload.erpEventId,
            ),
        );
        return { ok: true };
    }
}
