import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErpCallbackController } from '../../erp-callback.controller';

describe('ErpCallbackController', () => {
    let eventBus: { publish: ReturnType<typeof vi.fn> };
    let requestContextService: { create: ReturnType<typeof vi.fn> };
    let controller: ErpCallbackController;

    beforeEach(() => {
        eventBus = { publish: vi.fn() };
        requestContextService = { create: vi.fn(async () => ({})) };
        controller = new ErpCallbackController(eventBus as never, requestContextService as never);
    });

    describe('receivePayment', () => {
        it('publishes ErpPaymentReportedEvent when erpEventId is present', async () => {
            await controller.receivePayment({} as never, {
                invoiceId: 1,
                outcome: 'success',
                erpEventId: 'ERP-PMT-1',
            });

            expect(eventBus.publish).toHaveBeenCalledTimes(1);
        });

        it('rejects with 400 when erpEventId is missing — a payment fact without its mandatory reconciliation requisite is invalid input, not silently accepted', async () => {
            await expect(
                controller.receivePayment({} as never, {
                    invoiceId: 1,
                    outcome: 'success',
                    erpEventId: '',
                }),
            ).rejects.toBeInstanceOf(BadRequestException);

            expect(eventBus.publish).not.toHaveBeenCalled();
        });
    });
});
