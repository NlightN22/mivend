import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import InvoicePayPage from './InvoicePayPage.vue';

const meta: Meta<typeof InvoicePayPage> = {
    title: 'Pages/Invoices/InvoicePayPage',
    component: InvoicePayPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof InvoicePayPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('InvoiceDetail', () => ({
                invoice: {
                    id: '1',
                    orderId: '1',
                    organizationId: 'org-1',
                    amount: 460000,
                    currencyCode: 'RUB',
                    status: 'issued',
                    order: { id: '1', code: 'ORD-101' },
                    lines: [],
                },
            }));
            await router.push('/invoices/1/pay');
        },
    ],
    render: () => ({
        components: { InvoicePayPage },
        template: '<InvoicePayPage />',
    }),
};
