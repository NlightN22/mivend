import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import PaymentResultPage from './PaymentResultPage.vue';

// Combined docs render all stories at once; their loaders push routes on a shared router singleton,
// so the pushes collide and every canvas lands on the last route; use per-story canvases instead.
const meta: Meta<typeof PaymentResultPage> = {
    title: 'Pages/Checkout/PaymentResultPage',
    component: PaymentResultPage,
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
