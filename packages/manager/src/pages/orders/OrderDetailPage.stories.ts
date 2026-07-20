import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import OrderDetailPage from './OrderDetailPage.vue';

// No 'autodocs': the combined Docs page renders every story's canvas at once, and each
// story's loader pushes a different route on the shared router singleton — the pushes
// collide and every canvas ends up on whichever route won last (see individual story
// canvases instead).
const meta: Meta<typeof OrderDetailPage> = {
    title: 'Pages/Orders/OrderDetailPage',
    component: OrderDetailPage,
};

export default meta;
type Story = StoryObj<typeof OrderDetailPage>;

function mockOrderDetailData(): void {
    registerMock('OrderDetail', () => ({
        visibleOrders: {
            items: [
                {
                    id: '1',
                    code: 'ORD-101',
                    state: 'PaymentAuthorized',
                    orderPlacedAt: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    currencyCode: 'RUB',
                    subTotalWithTax: 400000,
                    shippingWithTax: 50000,
                    totalWithTax: 450000,
                    customFields: { reservationDays: 7 },
                    lines: [
                        {
                            id: '1',
                            quantity: 2,
                            unitPriceWithTax: 200000,
                            linePriceWithTax: 400000,
                            productVariant: { id: '1', name: 'Brake pad set', sku: 'SKU-001' },
                            customFields: { manualUnitPrice: null, manualPriceReason: null },
                        },
                    ],
                    customer: {
                        firstName: 'Ivan',
                        lastName: 'Petrov',
                        counterparty: {
                            id: '1',
                            shortName: 'customer-123',
                            inn: '7701234567',
                            assignedManagerId: '1',
                            priceType: 'price-type-wholesale',
                        },
                    },
                },
            ],
        },
    }));
    registerMock('TeamMembers', () => ({
        teamMembers: [{ id: '1', firstName: 'Alex', lastName: 'Manager', roleCodes: ['manager'] }],
    }));
    registerMock('PriceAdjustmentRequestsForOrder', () => ({
        priceAdjustmentRequestsForOrder: [],
    }));
    registerMock('RelatedDocuments', () => ({ documents: { items: [] } }));
    registerMock('OrderReservations', () => ({ orderReservations: [] }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockOrderDetailData();
            await router.push('/orders/ORD-101');
        },
    ],
    render: () => ({
        components: { OrderDetailPage },
        template: '<OrderDetailPage />',
    }),
};

export const NotFound: Story = {
    loaders: [
        async () => {
            registerMock('OrderDetail', () => ({ visibleOrders: { items: [] } }));
            registerMock('TeamMembers', () => ({ teamMembers: [] }));
            await router.push('/orders/ORD-999');
        },
    ],
    render: () => ({
        components: { OrderDetailPage },
        template: '<OrderDetailPage />',
    }),
};
