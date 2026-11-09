import { adminGql, shopGql, shopLoginCookie } from '../helpers/api';
import { SEED_LOCATION } from './seed-location';

export const ORDER_CP = {
    counterpartyErpId: 'e2e-cnt-ordercp',
    shortName: 'E2E Order Own Co',
    pointErpId: 'e2e-tp-ordercp',
    customerEmail: 'e2e-ordercp@test.example',
    password: 'E2eTest123!',
};

// The customer is deactivated after placement, so the order is the only holder of the counterparty link.
export const orderCpSeedRecords = [
    {
        type: 'counterparty' as const,
        data: {
            erpId: ORDER_CP.counterpartyErpId,
            legalName: 'E2E Order Own Company',
            shortName: ORDER_CP.shortName,
            inn: '5100000004',
            creditLimit: 1000000,
            creditBalance: 0,
            paymentDelayDays: 30,
            priceType: 'WHOLESALE',
            isActive: true,
            departmentId: 'dept-sales',
        },
    },
    {
        type: 'customer' as const,
        data: {
            email: ORDER_CP.customerEmail,
            firstName: 'E2E',
            lastName: 'OrderOwn',
            password: ORDER_CP.password,
        },
    },
    {
        type: 'customerCounterparty' as const,
        data: {
            customerEmail: ORDER_CP.customerEmail,
            counterpartyErpId: ORDER_CP.counterpartyErpId,
        },
    },
    {
        type: 'tradingPoint' as const,
        data: {
            erpId: ORDER_CP.pointErpId,
            counterpartyErpId: ORDER_CP.counterpartyErpId,
            name: 'E2E Order Own Point',
            address: 'Order Own Street 1',
            ...SEED_LOCATION,
            isActive: true,
        },
    },
];

// erp-import never writes servicingBranchId, which order stock allocation keys on (see global-setup).
export async function prepareOrderCpCustomer(
    adminToken: string,
    centralBranchId: string,
): Promise<void> {
    const { data } = await adminGql<{
        counterparties: {
            items: { erpId: string; tradingPoints: { id: string; erpId: string }[] }[];
        };
    }>(
        `query { counterparties(options: { take: 200 }) { items { erpId tradingPoints { id erpId } } } }`,
        undefined,
        adminToken,
    );
    const point = data.counterparties.items
        .find(c => c.erpId === ORDER_CP.counterpartyErpId)
        ?.tradingPoints.find(tp => tp.erpId === ORDER_CP.pointErpId);
    if (!point) throw new Error(`Seeded trading point ${ORDER_CP.pointErpId} not found`);
    await adminGql(
        `mutation($id: ID!, $input: TradingPointDetailsInput!) {
            updateTradingPointDetails(id: $id, input: $input) { id }
        }`,
        { id: point.id, input: { servicingBranchId: centralBranchId, ...SEED_LOCATION } },
        adminToken,
    );
    const cookie = await shopLoginCookie(ORDER_CP.customerEmail, ORDER_CP.password);
    const preferred = await shopGql<{ setPreferredTradingPoint: boolean }>(
        `mutation($id: ID!) { setPreferredTradingPoint(tradingPointId: $id) }`,
        { id: point.id },
        cookie,
    );
    if (!preferred.setPreferredTradingPoint) throw new Error('setPreferredTradingPoint failed');
}
