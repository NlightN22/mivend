import type { Meta, StoryObj } from '@storybook/vue3';
import MvLogo from './MvLogo.vue';
import type { LogoSize } from './MvLogo.vue';

const SIZES: LogoSize[] = ['sm', 'md', 'lg'];

const meta: Meta<typeof MvLogo> = {
    title: 'Atoms/MvLogo',
    component: MvLogo,
    tags: ['autodocs'],
    argTypes: {
        name: { control: 'text' },
        size: { control: 'select', options: SIZES },
    },
    args: { name: 'mivend', size: 'md' },
};

export default meta;
type Story = StoryObj<typeof MvLogo>;

export const Default: Story = {
    render: args => ({
        components: { MvLogo },
        setup: () => ({ args }),
        template: '<MvLogo v-bind="args" />',
    }),
};

export const AllSizes: Story = {
    render: () => ({
        components: { MvLogo },
        setup: () => ({ sizes: SIZES }),
        template: `
      <div style="display: flex; flex-direction: column; gap: 16px; align-items: flex-start;">
        <MvLogo v-for="s in sizes" :key="s" :size="s" />
      </div>
    `,
    }),
};
