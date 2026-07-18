import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import DocumentsPage from './DocumentsPage.vue';

const meta: Meta<typeof DocumentsPage> = {
    title: 'Pages/Documents/DocumentsPage',
    component: DocumentsPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DocumentsPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('MyDocuments', () => ({
                myDocuments: {
                    items: [
                        {
                            id: '1',
                            type: 'invoice',
                            number: 'INV-0001',
                            issueDate: new Date().toISOString(),
                            amount: 460000,
                            currencyCode: 'RUB',
                            status: 'issued',
                            orderId: '1',
                            fileUrl: '#',
                            asset: null,
                        },
                    ],
                    totalItems: 1,
                },
            }));
            await router.push('/documents');
        },
    ],
    render: () => ({
        components: { DocumentsPage },
        template: '<DocumentsPage />',
    }),
};

export const Empty: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('MyDocuments', () => ({ myDocuments: { items: [], totalItems: 0 } }));
            await router.push('/documents');
        },
    ],
    render: () => ({
        components: { DocumentsPage },
        template: '<DocumentsPage />',
    }),
};
