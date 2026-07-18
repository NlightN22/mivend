import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import OrderCreatedPage from './OrderCreatedPage.vue';

// No 'autodocs': the combined Docs page renders every story's canvas at once, and each
// story's loader pushes a different route on the shared router singleton — the pushes
// collide and every canvas ends up on whichever route won last (see individual story
// canvases instead).
const meta: Meta<typeof OrderCreatedPage> = {
    title: 'Pages/Checkout/OrderCreatedPage',
    component: OrderCreatedPage,
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
