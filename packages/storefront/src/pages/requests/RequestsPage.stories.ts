import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import RequestsPage from './RequestsPage.vue';

const meta: Meta<typeof RequestsPage> = {
    title: 'Pages/Requests/RequestsPage',
    component: RequestsPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof RequestsPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            await router.push('/requests');
        },
    ],
    render: () => ({
        components: { RequestsPage },
        template: '<RequestsPage />',
    }),
};
