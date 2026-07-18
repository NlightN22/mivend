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

// A dedicated sidebar entry pinned to the mobile viewport (see AGENTS.md's "Manager portal
// rules" tab-overflow pattern), seeded with enough departments to actually trigger the "More"
// collapse — Default's single department never exercises it.
export const Mobile: Story = {
    loaders: [
        async () => {
            registerMock('Departments', () => ({
                departments: [
                    { id: '1', erpId: 'dept-sales', name: 'Sales' },
                    { id: '2', erpId: 'dept-purchasing', name: 'Purchasing' },
                    { id: '3', erpId: 'dept-warehouse', name: 'Warehouse' },
                    { id: '4', erpId: 'dept-accounting', name: 'Accounting' },
                    { id: '5', erpId: 'dept-support', name: 'Customer support' },
                ],
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
    parameters: { viewport: { defaultViewport: 'mvMobile' } },
};
