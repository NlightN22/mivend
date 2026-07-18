import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import RolesListPage from './RolesListPage.vue';

const meta: Meta<typeof RolesListPage> = {
    title: 'Pages/Settings/RolesListPage',
    component: RolesListPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof RolesListPage>;

const ROLE_ITEMS = [
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
];

export const Default: Story = {
    loaders: [
        async () => {
            registerMock('Roles', () => ({ roles: { items: ROLE_ITEMS } }));
            await router.push('/settings/roles');
        },
    ],
    render: () => ({
        components: { RolesListPage },
        template: '<RolesListPage />',
    }),
};
