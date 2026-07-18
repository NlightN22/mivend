import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import AccessDeniedPage from './AccessDeniedPage.vue';

const meta: Meta<typeof AccessDeniedPage> = {
    title: 'Pages/Error/AccessDeniedPage',
    component: AccessDeniedPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof AccessDeniedPage>;

export const LoggedIn: Story = {
    loaders: [
        async () => {
            await router.push('/access-denied');
        },
    ],
    render: () => ({
        components: { AccessDeniedPage },
        template: '<AccessDeniedPage />',
    }),
};

export const LoggedOut: Story = {
    loaders: [
        async () => {
            registerMock('ActiveCustomerForAuth', () => ({ activeCustomer: null }));
            await router.push('/access-denied');
        },
    ],
    render: () => ({
        components: { AccessDeniedPage },
        template: '<AccessDeniedPage />',
    }),
};
