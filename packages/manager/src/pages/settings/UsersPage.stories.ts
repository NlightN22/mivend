import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import UsersPage from './UsersPage.vue';

const meta: Meta<typeof UsersPage> = {
    title: 'Pages/Settings/UsersPage',
    component: UsersPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof UsersPage>;

const DEPARTMENT_ITEMS = [{ id: '1', erpId: 'dept-sales', name: 'Sales' }];

const ROLE_ITEMS = [
    { id: '1', code: 'manager', description: 'Manager — own book of customers/orders' },
    {
        id: '2',
        code: 'general-director',
        description: 'General director — full company-wide visibility',
    },
];

const PORTAL_USER_ITEMS = [
    {
        id: '1',
        firstName: 'Petr',
        lastName: 'Manager',
        emailAddress: 'petr.manager@mivend.dev',
        isActive: true,
        customFields: { departmentId: 'dept-sales' },
        user: { roles: [{ code: 'manager' }] },
    },
    {
        id: '2',
        firstName: 'Olga',
        lastName: 'DeptHead',
        emailAddress: 'olga.depthead@mivend.dev',
        isActive: false,
        customFields: { departmentId: null },
        user: { roles: [{ code: 'department-head' }] },
    },
];

const PENDING_USER_ITEMS = [
    {
        id: '10',
        erpId: 'erp-user-1',
        fullName: 'Roman Pogareltsev',
        email: 'r.pogareltsev@example.com',
        departmentId: 'dept-sales',
    },
];

// Registers every operation both dataset views can call — a story only ever renders one view at
// a time, but the counts query (PortalUserCounts) always fires regardless of which is active.
// Overrides the default-mocks.ts ActiveAdministrator (its stock role has no
// ManageAdministratorLifecycle) so this story renders the real page instead of the "Not
// authorized" gate.
function registerCommonMocks(): void {
    registerMock('ActiveAdministrator', () => ({
        activeAdministrator: {
            id: '1',
            firstName: 'Anna',
            lastName: 'PortalAdmin',
            emailAddress: 'anna.portaladmin@mivend.dev',
            customFields: { departmentId: null, branchId: null },
            user: {
                roles: [
                    {
                        code: 'portal-admin',
                        description: 'Portal administrator',
                        permissions: ['ManageAdministratorLifecycle', 'ManageAccessControl'],
                    },
                ],
            },
        },
    }));
    registerMock('Departments', () => ({ departments: DEPARTMENT_ITEMS }));
    registerMock('Roles', () => ({ roles: { items: ROLE_ITEMS } }));
    registerMock('PortalUserCounts', () => ({
        users: { totalItems: PORTAL_USER_ITEMS.length },
        pending: { totalItems: PENDING_USER_ITEMS.length },
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            registerCommonMocks();
            registerMock('PortalUsers', () => ({
                portalUsers: { items: PORTAL_USER_ITEMS, totalItems: PORTAL_USER_ITEMS.length },
            }));
            await router.push('/settings/users');
        },
    ],
    render: () => ({
        components: { UsersPage },
        template: '<UsersPage />',
    }),
};

export const Pending: Story = {
    loaders: [
        async () => {
            registerCommonMocks();
            registerMock('PendingErpUsersPage', () => ({
                pendingErpUsers: {
                    items: PENDING_USER_ITEMS,
                    totalItems: PENDING_USER_ITEMS.length,
                },
            }));
            await router.push('/settings/users?view=pending');
        },
    ],
    render: () => ({
        components: { UsersPage },
        template: '<UsersPage />',
    }),
};
