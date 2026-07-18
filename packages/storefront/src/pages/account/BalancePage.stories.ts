import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import BalancePage from './BalancePage.vue';

const meta: Meta<typeof BalancePage> = {
    title: 'Pages/Account/BalancePage',
    component: BalancePage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof BalancePage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            await router.push('/account/balance');
        },
    ],
    render: () => ({
        components: { BalancePage },
        template: '<BalancePage />',
    }),
};
