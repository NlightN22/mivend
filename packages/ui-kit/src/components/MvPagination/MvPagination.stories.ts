import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvPagination from './MvPagination.vue';

const meta: Meta<typeof MvPagination> = {
    title: 'Molecules/MvPagination',
    component: MvPagination,
    tags: ['autodocs'],
    argTypes: {
        page: { control: 'number' },
        pageSize: { control: 'number' },
        total: { control: 'number' },
    },
    args: { page: 2, pageSize: 20, total: 137 },
};

export default meta;
type Story = StoryObj<typeof MvPagination>;

export const Default: Story = {
    render: args => ({
        components: { MvPagination },
        setup: () => {
            const page = ref(args.page);
            return { args, page };
        },
        template: '<MvPagination v-bind="args" :page="page" @update:page="page = $event" />',
    }),
};

export const FirstPage: Story = {
    args: { page: 1 },
    render: args => ({
        components: { MvPagination },
        setup: () => ({ args }),
        template: '<MvPagination v-bind="args" />',
    }),
};

export const LastPage: Story = {
    args: { page: 7, pageSize: 20, total: 137 },
    render: args => ({
        components: { MvPagination },
        setup: () => ({ args }),
        template: '<MvPagination v-bind="args" />',
    }),
};

export const Empty: Story = {
    args: { page: 1, pageSize: 20, total: 0 },
    render: args => ({
        components: { MvPagination },
        setup: () => ({ args }),
        template: '<MvPagination v-bind="args" />',
    }),
};
