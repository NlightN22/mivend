import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import TeamPage from './TeamPage.vue';

const meta: Meta<typeof TeamPage> = {
    title: 'Pages/Settings/TeamPage',
    component: TeamPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof TeamPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerMock('SecurityAdministrators', () => ({
                administrators: {
                    items: [
                        {
                            id: '1',
                            firstName: 'Alex',
                            lastName: 'Manager',
                            emailAddress: 'manager@example.com',
                            user: { roles: [{ code: 'manager' }] },
                        },
                    ],
                },
            }));
            registerMock('Roles', () => ({
                roles: {
                    items: [
                        {
                            id: '1',
                            code: 'manager',
                            description: 'Manager — own book of customers/orders',
                        },
                        {
                            id: '2',
                            code: 'general-director',
                            description: 'General director — full company-wide visibility',
                        },
                    ],
                },
            }));
            await router.push('/settings/team');
        },
    ],
    render: () => ({
        components: { TeamPage },
        template: '<TeamPage />',
    }),
};
