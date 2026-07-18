import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import NotFoundPage from './NotFoundPage.vue';

const meta: Meta<typeof NotFoundPage> = {
    title: 'Pages/Error/NotFoundPage',
    component: NotFoundPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof NotFoundPage>;

export const Default: Story = {
    loaders: [
        async () => {
            await router.push('/some-nonexistent-route');
        },
    ],
    render: () => ({
        components: { NotFoundPage },
        template: '<NotFoundPage />',
    }),
};
