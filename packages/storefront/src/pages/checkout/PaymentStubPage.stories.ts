import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import PaymentStubPage from './PaymentStubPage.vue';

const meta: Meta<typeof PaymentStubPage> = {
    title: 'Pages/Checkout/PaymentStubPage',
    component: PaymentStubPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof PaymentStubPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            await router.push('/payment-stub');
        },
    ],
    render: () => ({
        components: { PaymentStubPage },
        template: '<PaymentStubPage />',
    }),
};
