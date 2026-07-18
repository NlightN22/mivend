import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import EmployeesPage from './EmployeesPage.vue';

const meta: Meta<typeof EmployeesPage> = {
    title: 'Pages/Account/EmployeesPage',
    component: EmployeesPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof EmployeesPage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            await router.push('/account/employees');
        },
    ],
    render: () => ({
        components: { EmployeesPage },
        template: '<EmployeesPage />',
    }),
};
