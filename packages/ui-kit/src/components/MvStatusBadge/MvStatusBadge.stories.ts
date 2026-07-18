import type { Meta, StoryObj } from '@storybook/vue3';
import MvStatusBadge from './MvStatusBadge.vue';
import type { StatusBadgeVariant } from './MvStatusBadge.vue';

const VARIANTS: StatusBadgeVariant[] = ['neutral', 'success', 'warning', 'danger', 'info'];

const meta: Meta<typeof MvStatusBadge> = {
    title: 'Atoms/MvStatusBadge',
    component: MvStatusBadge,
    tags: ['autodocs'],
    argTypes: {
        variant: { control: 'select', options: VARIANTS },
    },
    args: { variant: 'neutral' },
};

export default meta;
type Story = StoryObj<typeof MvStatusBadge>;

export const Default: Story = {
    render: args => ({
        components: { MvStatusBadge },
        setup: () => ({ args }),
        template: '<MvStatusBadge v-bind="args">Draft</MvStatusBadge>',
    }),
};

export const AllVariants: Story = {
    render: () => ({
        components: { MvStatusBadge },
        setup: () => ({ variants: VARIANTS }),
        template: `
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <MvStatusBadge v-for="v in variants" :key="v" :variant="v">{{ v }}</MvStatusBadge>
      </div>
    `,
    }),
};
