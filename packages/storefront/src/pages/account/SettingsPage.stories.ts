import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import SettingsPage from './SettingsPage.vue';

const meta: Meta<typeof SettingsPage> = {
    title: 'Pages/Account/SettingsPage',
    component: SettingsPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SettingsPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('MySessions', () => ({
                mySessions: [
                    {
                        id: 'session-1',
                        deviceLabel: 'Chrome on macOS',
                        createdAt: new Date().toISOString(),
                        current: true,
                    },
                    {
                        id: 'session-2',
                        deviceLabel: 'Safari on iOS',
                        createdAt: new Date(Date.now() - 86400000).toISOString(),
                        current: false,
                    },
                ],
            }));
            await router.push('/account/settings');
        },
    ],
    render: () => ({
        components: { SettingsPage },
        template: '<SettingsPage />',
    }),
};
