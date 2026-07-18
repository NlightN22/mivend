import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import OrderCreatedPage from './OrderCreatedPage.vue';

const meta: Meta<typeof OrderCreatedPage> = {
    title: 'Pages/Checkout/OrderCreatedPage',
    component: OrderCreatedPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof OrderCreatedPage>;

export const Invoice: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            await router.push('/order-created?method=invoice');
        },
    ],
    render: () => ({
        components: { OrderCreatedPage },
        template: '<OrderCreatedPage />',
    }),
};

export const Deferred: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            await router.push('/order-created?method=deferred');
        },
    ],
    render: () => ({
        components: { OrderCreatedPage },
        template: '<OrderCreatedPage />',
    }),
};
