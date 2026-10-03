import type { Meta, StoryObj } from '@storybook/vue3';
import MvCatalogDropdown from './MvCatalogDropdown.vue';
import type { CollectionNode } from './MvCatalogDropdown.vue';

const leaf = (id: string): CollectionNode => ({ id, name: id, slug: id, children: [] });
const group = (id: string, count: number): CollectionNode => ({
    id,
    name: id,
    slug: id,
    children: Array.from({ length: count }, (_, i) => leaf(`${id}-item-${i + 1}`)),
});

const COLLECTIONS: CollectionNode[] = [
    {
        id: 'engine',
        name: 'Engine',
        slug: 'engine',
        children: [group('oils', 8), group('filters', 3), leaf('belts')],
    },
    { id: 'brakes', name: 'Brakes', slug: 'brakes', children: [group('pads', 2), leaf('discs')] },
    leaf('suspension'),
];

const meta: Meta<typeof MvCatalogDropdown> = {
    title: 'Organisms/MvCatalogDropdown',
    component: MvCatalogDropdown,
    tags: ['autodocs'],
    args: { collections: COLLECTIONS, open: true },
};

export default meta;
type Story = StoryObj<typeof MvCatalogDropdown>;

export const Default: Story = {
    render: args => ({
        components: { MvCatalogDropdown },
        setup: () => ({ args }),
        template:
            '<div style="position: relative; height: 520px;"><MvCatalogDropdown v-bind="args" @close="() => {}" /></div>',
    }),
};

export const EmptyChildren: Story = {
    args: {
        collections: [{ id: 'suspension', name: 'Suspension', slug: 'suspension', children: [] }],
    },
    render: args => ({
        components: { MvCatalogDropdown },
        setup: () => ({ args }),
        template:
            '<div style="position: relative; height: 520px;"><MvCatalogDropdown v-bind="args" @close="() => {}" /></div>',
    }),
};
