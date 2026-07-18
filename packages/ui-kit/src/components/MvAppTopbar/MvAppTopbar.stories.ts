import type { Meta, StoryObj } from '@storybook/vue3';
import MvAppTopbar from './MvAppTopbar.vue';
import MvButton from '../MvButton/MvButton.vue';

const meta: Meta<typeof MvAppTopbar> = {
    title: 'Organisms/MvAppTopbar',
    component: MvAppTopbar,
    tags: ['autodocs'],
    argTypes: {
        userName: { control: 'text' },
        userRoleLabel: { control: 'text' },
        userInitials: { control: 'text' },
        searchPlaceholder: { control: 'text' },
    },
    args: {
        userName: 'Alex Ivanov',
        userRoleLabel: 'Manager',
        userInitials: 'AI',
        searchPlaceholder: 'Search…',
    },
};

export default meta;
type Story = StoryObj<typeof MvAppTopbar>;

export const Default: Story = {
    render: args => ({
        components: { MvAppTopbar },
        setup: () => ({ args }),
        template: '<MvAppTopbar v-bind="args" @logout="() => {}" />',
    }),
};

export const WithActionsSlot: Story = {
    render: args => ({
        components: { MvAppTopbar, MvButton },
        setup: () => ({ args }),
        template: `
      <MvAppTopbar v-bind="args" @logout="() => {}">
        <template #actions><MvButton size="sm" variant="secondary">Sync now</MvButton></template>
      </MvAppTopbar>
    `,
    }),
};

export const NoRole: Story = {
    args: { userRoleLabel: null },
    render: args => ({
        components: { MvAppTopbar },
        setup: () => ({ args }),
        template: '<MvAppTopbar v-bind="args" @logout="() => {}" />',
    }),
};
