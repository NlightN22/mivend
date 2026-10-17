import { describe, it, expect, vi, beforeEach } from 'vitest';
import { freightPointGuard, FREIGHT_WITHOUT_POINT_MESSAGE } from '../../freight-point.guard';

const orderRepo = { findOne: vi.fn() };
const shippingRepo = { find: vi.fn() };
const connection = {
    getRepository: vi.fn((_c: unknown, entity: { name: string }) =>
        entity.name === 'ShippingLine' ? shippingRepo : orderRepo,
    ),
};
const tradingPoints = { findById: vi.fn(), getPreferredForCustomer: vi.fn() };
const counterparties = { getForCustomer: vi.fn() };
const administrators = { findOneByUserId: vi.fn() };
const injector = {
    get: (token: { name: string }) =>
        ({
            TransactionalConnection: connection,
            TradingPointService: tradingPoints,
            CounterpartyService: counterparties,
            AdministratorService: administrators,
        })[token.name],
};

const ctx = { activeUserId: 'user-1' };
const order = { id: 1, customerId: 'cust-1' };
const activePoint = { id: 9, isActive: true, customerStatus: 'active', counterpartyId: '5' };
const run = (from = 'AddingItems', to = 'ArrangingPayment'): unknown =>
    freightPointGuard.onTransitionStart?.(from as never, to as never, { ctx, order } as never);

describe('freightPointGuard', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        connection.getRepository.mockImplementation((_c: unknown, entity: { name: string }) =>
            entity.name === 'ShippingLine' ? shippingRepo : orderRepo,
        );
        freightPointGuard.init?.(injector as never);
        shippingRepo.find.mockResolvedValue([{ shippingMethod: { code: 'freight-delivery' } }]);
        administrators.findOneByUserId.mockResolvedValue({ id: 'admin-1' });
        counterparties.getForCustomer.mockResolvedValue({ id: 5 });
    });

    it('lets a staff courier order through when its chosen point belongs to the order client', async () => {
        orderRepo.findOne.mockResolvedValue({ customFields: { tradingPointId: '9' } });
        tradingPoints.findById.mockResolvedValue(activePoint);
        expect(await run('Draft')).toBeUndefined();
    });

    it('refuses a staff courier order with no chosen point, even though the customer has a preferred one', async () => {
        orderRepo.findOne.mockResolvedValue({ customFields: {} });
        tradingPoints.getPreferredForCustomer.mockResolvedValue(activePoint);
        expect(await run('Draft')).toBe(FREIGHT_WITHOUT_POINT_MESSAGE);
    });

    it('refuses a staff courier order whose point is inactive or of another counterparty', async () => {
        orderRepo.findOne.mockResolvedValue({ customFields: { tradingPointId: '9' } });
        tradingPoints.findById.mockResolvedValue({ ...activePoint, isActive: false });
        expect(await run('Draft')).toBe(FREIGHT_WITHOUT_POINT_MESSAGE);
        tradingPoints.findById.mockResolvedValue({ ...activePoint, counterpartyId: '6' });
        expect(await run('Draft')).toBe(FREIGHT_WITHOUT_POINT_MESSAGE);
    });

    it("uses the customer's preferred point for a storefront order and refuses when there is none", async () => {
        administrators.findOneByUserId.mockResolvedValue(null);
        tradingPoints.getPreferredForCustomer.mockResolvedValue(activePoint);
        expect(await run()).toBeUndefined();
        tradingPoints.getPreferredForCustomer.mockResolvedValue(null);
        expect(await run()).toBe(FREIGHT_WITHOUT_POINT_MESSAGE);
    });

    it('checks the rule again on payment, after the shipping method may have been changed', async () => {
        orderRepo.findOne.mockResolvedValue({ customFields: {} });
        expect(await run('ArrangingPayment', 'PaymentSettled')).toBe(FREIGHT_WITHOUT_POINT_MESSAGE);
        expect(await run('ArrangingPayment', 'PaymentAuthorized')).toBe(
            FREIGHT_WITHOUT_POINT_MESSAGE,
        );
        orderRepo.findOne.mockResolvedValue({ customFields: { tradingPointId: '9' } });
        tradingPoints.findById.mockResolvedValue(activePoint);
        expect(await run('ArrangingPayment', 'PaymentSettled')).toBeUndefined();
    });

    it('does not touch a pickup order or a transition that is not the placement', async () => {
        shippingRepo.find.mockResolvedValue([{ shippingMethod: { code: 'pickup' } }]);
        expect(await run()).toBeUndefined();
        shippingRepo.find.mockResolvedValue([{ shippingMethod: { code: 'freight-delivery' } }]);
        expect(await run('PaymentSettled', 'Shipped')).toBeUndefined();
        expect(await run('ArrangingPayment', 'AddingItems')).toBeUndefined();
        expect(await run('PaymentSettled', 'ArrangingPayment')).toBeUndefined();
    });
});
