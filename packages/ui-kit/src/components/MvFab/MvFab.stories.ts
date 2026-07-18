import type { Meta, StoryObj } from '@storybook/vue3';
import MvFab from './MvFab.vue';

const meta: Meta<typeof MvFab> = {
    title: 'Atoms/MvFab',
    component: MvFab,
    tags: ['autodocs'],
    argTypes: {
        to: { control: 'text' },
    },
};

export default meta;
type Story = StoryObj<typeof MvFab>;

export const AsLink: Story = {
    args: { to: '/orders/new' },
    render: args => ({
        components: { MvFab },
        setup: () => ({ args }),
        template:
            '<div style="position: relative; height: 160px;"><MvFab v-bind="args" aria-label="Create order" /></div>',
    }),
};

export const AsButton: Story = {
    render: () => ({
        components: { MvFab },
        template:
            '<div style="position: relative; height: 160px;"><MvFab aria-label="Create order" @click="() => {}" /></div>',
    }),
};
