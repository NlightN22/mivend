import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import SecurityPage from './SecurityPage.vue';

const meta: Meta<typeof SecurityPage> = {
    title: 'Pages/Settings/SecurityPage',
    component: SecurityPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SecurityPage>;

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
            await router.push('/settings/security');
        },
    ],
    render: () => ({
        components: { SecurityPage },
        template: '<SecurityPage />',
    }),
};
