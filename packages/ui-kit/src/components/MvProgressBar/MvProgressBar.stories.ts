import type { Meta, StoryObj } from '@storybook/vue3';
import MvProgressBar from './MvProgressBar.vue';
import type { ProgressBarVariant } from './MvProgressBar.vue';

const VARIANTS: ProgressBarVariant[] = ['normal', 'warn', 'danger'];

const meta: Meta<typeof MvProgressBar> = {
    title: 'Atoms/MvProgressBar',
    component: MvProgressBar,
    tags: ['autodocs'],
    argTypes: {
        value: { control: 'number' },
        max: { control: 'number' },
        label: { control: 'text' },
        variant: { control: 'select', options: VARIANTS },
    },
    args: {
        value: 65,
        max: 100,
        label: 'Credit limit used',
        variant: 'normal',
    },
};

export default meta;
type Story = StoryObj<typeof MvProgressBar>;

export const Default: Story = {
    render: args => ({
        components: { MvProgressBar },
        setup: () => ({ args }),
        template: '<div style="max-width: 320px;"><MvProgressBar v-bind="args" /></div>',
    }),
};

export const AllVariants: Story = {
    render: () => ({
        components: { MvProgressBar },
        setup: () => ({ variants: VARIANTS }),
        template: `
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 320px;">
        <MvProgressBar v-for="v in variants" :key="v" :value="70" :max="100" :label="v" :variant="v" />
      </div>
    `,
    }),
};
