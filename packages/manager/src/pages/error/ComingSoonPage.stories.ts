import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import ComingSoonPage from './ComingSoonPage.vue';

const meta: Meta<typeof ComingSoonPage> = {
    title: 'Pages/Error/ComingSoonPage',
    component: ComingSoonPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ComingSoonPage>;

export const Default: Story = {
    loaders: [
        async () => {
            await router.push('/profile');
        },
    ],
    render: () => ({
        components: { ComingSoonPage },
        template: '<ComingSoonPage />',
    }),
};
