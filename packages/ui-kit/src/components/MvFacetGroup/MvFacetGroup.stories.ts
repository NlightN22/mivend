import type { Meta, StoryObj } from '@storybook/vue3';
import MvFacetGroup from './MvFacetGroup.vue';

const meta: Meta<typeof MvFacetGroup> = {
    title: 'Molecules/MvFacetGroup',
    component: MvFacetGroup,
    tags: ['autodocs'],
    decorators: [() => ({ template: '<div style="max-width: 260px;"><story /></div>' })],
};

export default meta;
type Story = StoryObj<typeof MvFacetGroup>;

const brands = Array.from({ length: 15 }, (_, i) => ({
    id: `b${i}`,
    name: `Brand ${i + 1}`,
    count: 40 - i,
}));

export const Manufacturers: Story = {
    args: { title: 'Manufacturer', values: brands, selected: new Set(['b2', 'b12']) },
};

export const FewValues: Story = {
    args: { title: 'Manufacturer', values: brands.slice(0, 4), selected: new Set<string>() },
};
