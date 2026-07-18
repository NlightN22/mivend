import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import TeamPage from './TeamPage.vue';

const meta: Meta<typeof TeamPage> = {
    title: 'Pages/Team/TeamPage',
    component: TeamPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof TeamPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerMock('Departments', () => ({
                departments: [{ id: '1', erpId: 'dept-sales', name: 'Sales' }],
            }));
            registerMock('TeamDirectory', () => ({
                teamDirectory: [
                    {
                        id: '1',
                        firstName: 'Alex',
                        lastName: 'Manager',
                        roleCodes: ['manager'],
                        departmentId: 'dept-sales',
                        branchId: 'branch-a',
                        position: 'Sales manager',
                    },
                ],
            }));
            registerMock('Branches', () => ({
                branches: [{ erpId: 'branch-a', name: 'branch-a' }],
            }));
            await router.push('/team');
        },
    ],
    render: () => ({
        components: { TeamPage },
        template: '<TeamPage />',
    }),
};
