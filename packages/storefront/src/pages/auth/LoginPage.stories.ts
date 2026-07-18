import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import LoginPage from './LoginPage.vue';

const meta: Meta<typeof LoginPage> = {
    title: 'Pages/Auth/LoginPage',
    component: LoginPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof LoginPage>;

export const Default: Story = {
    loaders: [
        async () => {
            await router.push('/login');
        },
    ],
    render: () => ({
        components: { LoginPage },
        template: '<LoginPage />',
    }),
};
