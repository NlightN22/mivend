import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import RoleDetailPage from './RoleDetailPage.vue';

const meta: Meta<typeof RoleDetailPage> = {
    title: 'Pages/Settings/RoleDetailPage',
    component: RoleDetailPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof RoleDetailPage>;

const ROLE_DETAIL_ITEM = {
    id: '1',
    code: 'manager',
    description: 'Manager — own book of customers/orders',
    permissions: ['ReadOrder', 'CreateOrder', 'ReadCatalog', 'ReadCustomer'],
};

const PERMISSION_CATALOG_ITEMS = [
    { name: 'ReadOrder', description: 'Read orders' },
    { name: 'CreateOrder', description: 'Create orders' },
    { name: 'ReadCatalog', description: 'Read catalog' },
    { name: 'ReadCustomer', description: 'Read customers' },
];

export const Default: Story = {
    loaders: [
        async () => {
            registerMock('RoleDetail', () => ({ roles: { items: [ROLE_DETAIL_ITEM] } }));
            registerMock('RoleAccessScopeConfig', () => ({
                roleAccessScopeConfig: JSON.stringify({
                    counterparty: 'own',
                    order: 'own',
                    teamVisibility: 'own',
                }),
            }));
            registerMock('CreditTermLimit', () => ({
                creditTermLimit: { roleCode: 'manager', maxExtraDays: 7, maxAmount: 500000 },
            }));
            registerMock('PermissionCatalog', () => ({
                globalSettings: { serverConfig: { permissions: PERMISSION_CATALOG_ITEMS } },
            }));
            await router.push('/settings/roles/manager');
        },
    ],
    render: () => ({
        components: { RoleDetailPage },
        template: '<RoleDetailPage />',
    }),
};
