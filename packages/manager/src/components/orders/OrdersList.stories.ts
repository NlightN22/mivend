import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import OrdersList from './OrdersList.vue';
import { mockOrdersList } from './ordersListMocks';

const meta: Meta<typeof OrdersList> = {
    title: 'Components/Orders/OrdersList',
    component: OrdersList,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof OrdersList>;

export const Default: Story = {
    loaders: [
        async () => {
            mockOrdersList();
            await router.push('/orders');
        },
    ],
};

// The preset is the shape the customer card's Orders tab will use: the customer is fixed and
// never offered as a filter or column.
export const PresetCustomer: Story = {
    args: { customerId: 'c1' },
    loaders: [
        async () => {
            mockOrdersList();
            await router.push('/orders');
        },
    ],
};

export const Empty: Story = {
    loaders: [
        async () => {
            mockOrdersList([]);
            await router.push('/orders');
        },
    ],
};

export const Mobile: Story = {
    loaders: [
        async () => {
            mockOrdersList();
            await router.push('/orders');
        },
    ],
    parameters: { viewport: { defaultViewport: 'mvMobile' } },
};
