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

function registerTeamMocks(): void {
    registerMock('Departments', () => ({
        departments: [
            { id: '1', erpId: 'dept-sales', name: 'Sales' },
            { id: '2', erpId: 'dept-stock', name: 'Stock' },
        ],
    }));
    registerMock('TeamDirectory', () => ({
        teamDirectory: {
            totalItems: 3,
            items: [
                {
                    id: '1',
                    erpId: 'user-1',
                    firstName: 'Alex',
                    lastName: 'Manager',
                    active: true,
                    roleCodes: ['manager'],
                    departmentId: 'dept-sales',
                    departmentName: 'Sales',
                    branchId: 'branch-a',
                    position: 'Sales manager',
                },
                {
                    id: '2',
                    erpId: 'user-2',
                    firstName: null,
                    lastName: null,
                    active: true,
                    roleCodes: ['operator'],
                    departmentId: 'dept-stock',
                    departmentName: 'Stock',
                    branchId: 'branch-a',
                    position: null,
                },
                {
                    id: '3',
                    erpId: 'user-3',
                    firstName: null,
                    lastName: null,
                    active: false,
                    roleCodes: [],
                    departmentId: null,
                    departmentName: null,
                    branchId: null,
                    position: null,
                },
            ],
        },
    }));
    registerMock('TeamDirectoryCounts', () => ({
        all: { totalItems: 3 },
        active: { totalItems: 2 },
        inactive: { totalItems: 1 },
        unassigned: { totalItems: 0 },
    }));
    registerMock('Branches', () => ({
        branches: [{ id: 'branch-a', erpId: 'branch-a', name: 'Branch A' }],
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            registerTeamMocks();
            await router.push('/team');
        },
    ],
    render: () => ({
        components: { TeamPage },
        template: '<TeamPage />',
    }),
};

export const Mobile: Story = {
    loaders: [
        async () => {
            registerTeamMocks();
            await router.push('/team');
        },
    ],
    render: () => ({
        components: { TeamPage },
        template: '<TeamPage />',
    }),
    parameters: { viewport: { defaultViewport: 'mvMobile' } },
};
