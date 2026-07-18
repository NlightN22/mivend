import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import AccountPage from './AccountPage.vue';

const meta: Meta<typeof AccountPage> = {
    title: 'Pages/Account/AccountPage',
    component: AccountPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof AccountPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            await router.push('/account');
        },
    ],
    render: () => ({
        components: { AccountPage },
        template: '<AccountPage />',
    }),
};
