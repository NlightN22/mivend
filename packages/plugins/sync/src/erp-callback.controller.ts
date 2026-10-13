import {
    BadRequestException,
    Body,
    Controller,
    HttpCode,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { EventBus, RequestContextService } from '@vendure/core';
import { ErpOrderStatusEvent } from '@mivend/plugin-erp-order';
import type { ErpOrderStatus } from '@mivend/plugin-erp-order';
import { ErpStatusUpdateDto } from './dto/erp-status-update.dto';
import { ERP_PAYMENT_OUTCOMES, ErpPaymentReportedDto } from './dto/erp-payment-reported.dto';
import { ErpPaymentReportedEvent } from './erp-payment.events';
import { ErpCallbackApiKeyGuard } from './erp-callback-api-key.guard';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCUMENT_NUMBER_PATTERN = /^\d+(-\d+)*$/;

@ApiTags('ERP Callback')
@ApiSecurity('erp-callback-api-key')
@UseGuards(ErpCallbackApiKeyGuard)
@Controller('erp/callback')
export class ErpCallbackController {
    constructor(
        private readonly eventBus: EventBus,
        private readonly requestContextService: RequestContextService,
    ) {}

    @Post('order-status')
    @HttpCode(200)
    @ApiOperation({ summary: 'Receive an order status update pushed from the ERP (the ERP)' })
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
            'Receive a payment document pushed from the ERP, with its own amount; it may name a ProformaInvoice — durably ' +
            'enqueued by plugin-acquiring, never processed inline (the external-integration-rules skill). ' +
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
        if (!payload.proformaInvoiceUuid || !UUID_PATTERN.test(payload.proformaInvoiceUuid)) {
            throw new BadRequestException('proformaInvoiceUuid is required and must be a uuid');
        }
        if (!Number.isSafeInteger(payload.amount) || payload.amount <= 0) {
            throw new BadRequestException('amount must be a positive integer (minor units)');
        }
        if (!payload.currencyCode || !/^[A-Z]{3}$/.test(payload.currencyCode)) {
            throw new BadRequestException('currencyCode is required (ISO 4217, e.g. RUB)');
        }
        if (
            payload.proformaInvoiceNumber !== undefined &&
            !DOCUMENT_NUMBER_PATTERN.test(payload.proformaInvoiceNumber)
        ) {
            throw new BadRequestException(
                'proformaInvoiceNumber must be digits with optional hyphens (stored 001234-01 or displayed 001-234-01)',
            );
        }
        if (!ERP_PAYMENT_OUTCOMES.includes(payload.outcome)) {
            throw new BadRequestException(
                `outcome must be one of ${ERP_PAYMENT_OUTCOMES.join(', ')}, got "${String(payload.outcome)}"`,
            );
        }
        const ctx = await this.requestContextService.create({ apiType: 'admin', req });
        this.eventBus.publish(
            new ErpPaymentReportedEvent(ctx, {
                proformaInvoiceUuid: payload.proformaInvoiceUuid,
                proformaInvoiceNumber: payload.proformaInvoiceNumber,
                organizationId: payload.organizationId,
                outcome: payload.outcome,
                erpEventId: payload.erpEventId,
                amount: payload.amount,
                currencyCode: payload.currencyCode,
            }),
        );
        return { ok: true };
    }
}
