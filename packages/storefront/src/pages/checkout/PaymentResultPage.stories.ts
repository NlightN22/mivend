import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import PaymentResultPage from './PaymentResultPage.vue';

const meta: Meta<typeof PaymentResultPage> = {
    title: 'Pages/Checkout/PaymentResultPage',
    component: PaymentResultPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof PaymentResultPage>;

export const Success: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            await router.push('/payment-result?status=success');
        },
    ],
    render: () => ({
        components: { PaymentResultPage },
        template: '<PaymentResultPage />',
    }),
};

export const Pending: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            await router.push('/payment-result?status=pending');
        },
    ],
    render: () => ({
        components: { PaymentResultPage },
        template: '<PaymentResultPage />',
    }),
};

export const Failed: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            await router.push('/payment-result?status=fail');
        },
    ],
    render: () => ({
        components: { PaymentResultPage },
        template: '<PaymentResultPage />',
    }),
};
