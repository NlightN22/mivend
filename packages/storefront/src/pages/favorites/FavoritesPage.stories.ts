import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import FavoritesPage from './FavoritesPage.vue';

const meta: Meta<typeof FavoritesPage> = {
    title: 'Pages/Favorites/FavoritesPage',
    component: FavoritesPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof FavoritesPage>;

export const Empty: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            await router.push('/favorites');
        },
    ],
    render: () => ({
        components: { FavoritesPage },
        template: '<FavoritesPage />',
    }),
};
