import type { Meta, StoryObj } from '@storybook/vue3';
import MvIconButton from './MvIconButton.vue';
import type { IconButtonVariant } from './MvIconButton.vue';

const VARIANTS: IconButtonVariant[] = ['default', 'primary', 'orange'];

const meta: Meta<typeof MvIconButton> = {
    title: 'Atoms/MvIconButton',
    component: MvIconButton,
    tags: ['autodocs'],
    argTypes: {
        label: { control: 'text' },
        variant: { control: 'select', options: VARIANTS },
        title: { control: 'text' },
    },
    args: {
        label: 'Print',
        variant: 'default',
    },
};

export default meta;
type Story = StoryObj<typeof MvIconButton>;

export const Default: Story = {
    render: args => ({
        components: { MvIconButton },
        setup: () => ({ args }),
        template: '<MvIconButton v-bind="args">🖨</MvIconButton>',
    }),
};

export const AllVariants: Story = {
    render: () => ({
        components: { MvIconButton },
        setup: () => ({ variants: VARIANTS }),
        template: `
      <div style="display: flex; gap: 12px; padding: 24px;">
        <MvIconButton v-for="v in variants" :key="v" :variant="v" :label="v">⭐</MvIconButton>
      </div>
    `,
    }),
};
