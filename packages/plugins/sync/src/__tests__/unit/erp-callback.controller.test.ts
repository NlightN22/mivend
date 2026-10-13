import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErpCallbackController } from '../../erp-callback.controller';

const UUID = '8b1c7a0e-5d3f-4c1a-9a55-0d3f6f7a1c42';

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
                proformaInvoiceUuid: UUID,
                organizationId: 1,
                outcome: 'success',
                erpEventId: 'ERP-PMT-1',
                amount: 1000,
                currencyCode: 'RUB',
            });

            expect(eventBus.publish).toHaveBeenCalledTimes(1);
        });

        it('rejects with 400 when erpEventId is missing — a payment fact without its mandatory reconciliation requisite is invalid input, not silently accepted', async () => {
            await expect(
                controller.receivePayment({} as never, {
                    proformaInvoiceUuid: UUID,
                    organizationId: 1,
                    outcome: 'success',
                    erpEventId: '',
                    amount: 1000,
                    currencyCode: 'RUB',
                }),
            ).rejects.toBeInstanceOf(BadRequestException);

            expect(eventBus.publish).not.toHaveBeenCalled();
        });

        it('rejects with 400 when organizationId is missing — payment allocation is always scoped to one organization', async () => {
            await expect(
                controller.receivePayment({} as never, {
                    proformaInvoiceUuid: UUID,
                    organizationId: 0,
                    outcome: 'success',
                    erpEventId: 'ERP-PMT-2',
                    amount: 1000,
                    currencyCode: 'RUB',
                }),
            ).rejects.toBeInstanceOf(BadRequestException);

            expect(eventBus.publish).not.toHaveBeenCalled();
        });

        it.each([0, -5, 1.5, Number.NaN])('rejects amount %s', async amount => {
            await expect(
                controller.receivePayment({} as never, {
                    proformaInvoiceUuid: UUID,
                    organizationId: 1,
                    outcome: 'success',
                    erpEventId: 'ERP-PMT-A',
                    amount,
                    currencyCode: 'RUB',
                }),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('rejects with 400 when proformaInvoiceUuid is missing or not a uuid', async () => {
            await expect(
                controller.receivePayment({} as never, {
                    proformaInvoiceUuid: 'not-a-uuid',
                    organizationId: 1,
                    outcome: 'success',
                    erpEventId: 'ERP-PMT-3',
                    amount: 1000,
                    currencyCode: 'RUB',
                }),
            ).rejects.toBeInstanceOf(BadRequestException);

            expect(eventBus.publish).not.toHaveBeenCalled();
        });

        it('forwards the optional document number, and rejects a malformed one with 400', async () => {
            await controller.receivePayment({} as never, {
                proformaInvoiceUuid: UUID,
                proformaInvoiceNumber: '1042-01',
                organizationId: 1,
                outcome: 'success',
                erpEventId: 'ERP-PMT-5',
                amount: 1000,
                currencyCode: 'RUB',
            });
            const event = eventBus.publish.mock.calls[0][0];
            expect(event.fact.proformaInvoiceUuid).toBe(UUID);
            expect(event.fact.proformaInvoiceNumber).toBe('1042-01');

            await expect(
                controller.receivePayment({} as never, {
                    proformaInvoiceUuid: UUID,
                    proformaInvoiceNumber: 'INV-1',
                    organizationId: 1,
                    outcome: 'success',
                    erpEventId: 'ERP-PMT-6',
                    amount: 1000,
                    currencyCode: 'RUB',
                }),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('rejects with 400 when outcome is not one of the recognized values — otherwise it would silently reach OUTCOME_TO_PAYMENT_STATUS[outcome] as undefined downstream in plugin-acquiring', async () => {
            await expect(
                controller.receivePayment({} as never, {
                    proformaInvoiceUuid: UUID,
                    organizationId: 1,
                    outcome: 'bogus' as never,
                    erpEventId: 'ERP-PMT-4',
                    amount: 1000,
                    currencyCode: 'RUB',
                }),
            ).rejects.toBeInstanceOf(BadRequestException);

            expect(eventBus.publish).not.toHaveBeenCalled();
        });
    });
});
