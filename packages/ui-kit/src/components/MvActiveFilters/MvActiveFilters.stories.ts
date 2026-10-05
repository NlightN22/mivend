import type { Meta, StoryObj } from '@storybook/vue3';
import MvActiveFilters from './MvActiveFilters.vue';

const meta: Meta<typeof MvActiveFilters> = {
    title: 'Molecules/MvActiveFilters',
    component: MvActiveFilters,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof MvActiveFilters>;

export const Default: Story = {
    args: {
        chips: [
            { key: 'price', label: 'Price: 15 000 – 20 000' },
            { key: 'fv:b1', label: 'Manufacturer: Brand 1' },
            { key: 'inStock', label: 'In stock only' },
        ],
    },
};

export const Wrapping: Story = {
    args: {
        chips: Array.from({ length: 8 }, (_, i) => ({
            key: `fv:${i}`,
            label: `Manufacturer: Brand ${i + 1}`,
        })),
    },
    decorators: [() => ({ template: '<div style="max-width: 360px;"><story /></div>' })],
};
