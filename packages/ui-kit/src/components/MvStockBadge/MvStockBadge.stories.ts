import type { Meta, StoryObj } from '@storybook/vue3';
import MvStockBadge from './MvStockBadge.vue';

const meta: Meta<typeof MvStockBadge> = {
    title: 'Atoms/MvStockBadge',
    component: MvStockBadge,
    tags: ['autodocs'],
    argTypes: {
        variant: { control: 'select', options: ['ok', 'low', 'out'] },
        label: { control: 'text' },
        quantity: { control: 'number' },
    },
};

export default meta;
type Story = StoryObj<typeof MvStockBadge>;

export const ByVariant: Story = {
    render: () => ({
        components: { MvStockBadge },
        template: `
      <div style="display: flex; gap: 10px;">
        <MvStockBadge variant="ok" />
        <MvStockBadge variant="low" />
        <MvStockBadge variant="out" />
      </div>
    `,
    }),
};

export const ByQuantity: Story = {
    render: () => ({
        components: { MvStockBadge },
        template: `
      <div style="display: flex; gap: 10px;">
        <MvStockBadge :quantity="42" />
        <MvStockBadge :quantity="4" />
        <MvStockBadge :quantity="0" />
      </div>
    `,
    }),
};

export const CustomLabel: Story = {
    render: () => ({
        components: { MvStockBadge },
        template: '<MvStockBadge variant="ok" label="Ships in 2 days" />',
    }),
};
