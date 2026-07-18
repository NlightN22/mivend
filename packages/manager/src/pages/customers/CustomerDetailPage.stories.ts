import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import CustomerDetailPage from './CustomerDetailPage.vue';

const meta: Meta<typeof CustomerDetailPage> = {
    title: 'Pages/Customers/CustomerDetailPage',
    component: CustomerDetailPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CustomerDetailPage>;

function mockCustomerDetailData(): void {
    registerMock('CustomerById', () => ({
        counterparty: {
            id: '1',
            shortName: 'customer-123',
            legalName: 'customer-123 LLC',
            inn: '7701234567',
            priceType: 'price-type-wholesale',
            assignedManagerId: '1',
            branchId: 'branch-a',
            erpGroupLabel: null,
            isActive: true,
            tradingPoints: [
                {
                    id: 'tp-1',
                    name: 'Trading point A',
                    address: 'branch-a address',
                    workingHours: '09:00-18:00',
                    deliveryComment: null,
                    isActive: true,
                    contacts: [
                        {
                            name: 'Ivan Petrov',
                            phone: '+7 913 000-00-11',
                            email: null,
                            isPrimary: true,
                        },
                    ],
                },
            ],
        },
    }));
    registerMock('TeamMembers', () => ({
        teamMembers: [{ id: '1', firstName: 'Alex', lastName: 'Manager', roleCodes: ['manager'] }],
    }));
    registerMock('Branches', () => ({ branches: [{ erpId: 'branch-a', name: 'branch-a' }] }));
    registerMock('CustomerOrders', () => ({
        visibleOrders: {
            items: [
                {
                    code: 'ORD-101',
                    state: 'PaymentAuthorized',
                    totalWithTax: 450000,
                    currencyCode: 'RUB',
                    orderPlacedAt: new Date().toISOString(),
                },
            ],
        },
    }));
    registerMock('CustomerDiscountGrants', () => ({ discountGrantsForCounterparty: [] }));
    registerMock('CustomerDocuments', () => ({ documents: { items: [] } }));
    registerMock('InvoicesForCounterparty', () => ({ visibleInvoices: { items: [] } }));
    registerMock('PaymentsForCounterparty', () => ({ visiblePayments: { items: [] } }));
    registerMock('CustomersLookup', () => ({
        customers: { items: [{ id: '1', counterparty: { id: '1' } }] },
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockCustomerDetailData();
            await router.push('/customers/1');
        },
    ],
    render: () => ({
        components: { CustomerDetailPage },
        template: '<CustomerDetailPage />',
    }),
};
