import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import ProfilePage from './ProfilePage.vue';

const meta: Meta<typeof ProfilePage> = {
    title: 'Pages/Profile/ProfilePage',
    component: ProfilePage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ProfilePage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerMock('MySessions', () => ({
                mySessions: [
                    {
                        id: '1',
                        userAgent: 'Mozilla/5.0',
                        deviceLabel: 'Chrome on Windows',
                        createdAt: new Date().toISOString(),
                        expires: new Date(Date.now() + 86400000 * 30).toISOString(),
                        current: true,
                    },
                ],
            }));
            await router.push('/profile');
        },
    ],
    render: () => ({
        components: { ProfilePage },
        template: '<ProfilePage />',
    }),
};
