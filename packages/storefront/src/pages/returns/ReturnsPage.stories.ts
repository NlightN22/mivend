import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import ReturnsPage from './ReturnsPage.vue';

const meta: Meta<typeof ReturnsPage> = {
    title: 'Pages/Returns/ReturnsPage',
    component: ReturnsPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ReturnsPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('MyDocuments', () => ({
                myDocuments: {
                    items: [
                        {
                            id: '1',
                            type: 'return',
                            number: 'RET-0001',
                            issueDate: new Date().toISOString(),
                            amount: 460000,
                            currencyCode: 'RUB',
                            status: 'ready',
                            orderId: '1',
                            fileUrl: '#',
                            pdfUrl: null,
                        },
                    ],
                    totalItems: 1,
                },
            }));
            await router.push('/returns');
        },
    ],
    render: () => ({
        components: { ReturnsPage },
        template: '<ReturnsPage />',
    }),
};

export const Empty: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('MyDocuments', () => ({ myDocuments: { items: [], totalItems: 0 } }));
            await router.push('/returns');
        },
    ],
    render: () => ({
        components: { ReturnsPage },
        template: '<ReturnsPage />',
    }),
};
