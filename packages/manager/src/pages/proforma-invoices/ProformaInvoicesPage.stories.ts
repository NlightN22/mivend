import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { paginate } from '../../../.storybook/mock-list-utils';
import ProformaInvoicesPage from './ProformaInvoicesPage.vue';

const meta: Meta<typeof ProformaInvoicesPage> = {
    title: 'Pages/ProformaInvoices/ProformaInvoicesPage',
    component: ProformaInvoicesPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ProformaInvoicesPage>;

const CUSTOMERS = ['Customer One', 'Customer Two', 'Customer Three'];
const STATUSES = ['current', 'current', 'superseded', 'current', 'cancelled'];

const PROFORMA_INVOICES = Array.from({ length: 24 }, (_, i) => {
    const createdAt = new Date(Date.now() - i * 86400000).toISOString();
    return {
        id: String(i + 1),
        number: `${1000 + i}-01`,
        version: i % 5 === 2 ? 2 : 1,
        supersededBy: null,
        createdAt,
        orderId: String(i + 1),
        counterpartyId: String((i % 3) + 1),
        counterpartyShortName: CUSTOMERS[i % 3],
        amount: 45000 + i * 12345,
        currencyCode: 'RUB',
        displayStatus: STATUSES[i % 5],
        issuedAt: createdAt,
        dueDate: new Date(Date.now() + (5 - i) * 86400000).toISOString(),
        branchId: 'branch-a',
        order: { code: String(1000 + i) },
    };
});

interface ProformaInvoicesPageVariables {
    options?: { skip?: number; take?: number; status?: string; search?: string };
    counterpartyId?: string;
}

function mockProformaInvoicesData(): void {
    registerMock('ProformaInvoicesPage', (variables: ProformaInvoicesPageVariables) => {
        let filtered = PROFORMA_INVOICES;
        if (variables.options?.status) {
            filtered = filtered.filter(i => i.displayStatus === variables.options!.status);
        }
        const term = variables.options?.search?.toLowerCase();
        if (term) {
            filtered = filtered.filter(
                i =>
                    i.number.includes(term) || i.counterpartyShortName.toLowerCase().includes(term),
            );
        }
        if (variables.counterpartyId) {
            filtered = filtered.filter(i => i.counterpartyId === variables.counterpartyId);
        }
        return { visibleProformaInvoices: paginate(filtered, variables.options) };
    });
    registerMock('ProformaInvoiceViewCounts', () => ({
        all: { totalItems: 24 },
        current: { totalItems: 14 },
        superseded: { totalItems: 5 },
        cancelled: { totalItems: 5 },
    }));
    registerMock('TableViews', () => ({ tableViews: [] }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockProformaInvoicesData();
            await router.push('/proforma-invoices');
        },
    ],
    render: () => ({
        components: { ProformaInvoicesPage },
        template: '<ProformaInvoicesPage />',
    }),
};

export const Empty: Story = {
    loaders: [
        async () => {
            mockProformaInvoicesData();
            registerMock('ProformaInvoicesPage', () => ({
                visibleProformaInvoices: { items: [], totalItems: 0 },
            }));
            await router.push('/proforma-invoices');
        },
    ],
    render: () => ({
        components: { ProformaInvoicesPage },
        template: '<ProformaInvoicesPage />',
    }),
};
