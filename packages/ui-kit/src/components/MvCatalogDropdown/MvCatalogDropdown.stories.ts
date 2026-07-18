import type { Meta, StoryObj } from '@storybook/vue3';
import MvCatalogDropdown from './MvCatalogDropdown.vue';
import type { CollectionNode } from './MvCatalogDropdown.vue';

const COLLECTIONS: CollectionNode[] = [
    {
        id: 'brake-system',
        name: 'Brake system',
        slug: 'brake-system',
        children: [
            { id: 'brake-pads', name: 'Brake pads', slug: 'brake-pads', children: [] },
            { id: 'brake-discs', name: 'Brake discs', slug: 'brake-discs', children: [] },
        ],
    },
    {
        id: 'engine',
        name: 'Engine',
        slug: 'engine',
        children: [{ id: 'filters', name: 'Filters', slug: 'filters', children: [] }],
    },
    { id: 'suspension', name: 'Suspension', slug: 'suspension', children: [] },
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
            '<div style="position: relative; height: 520px;"><MvCatalogDropdown v-bind="args" @close="() => {}" @navigate="() => {}" /></div>',
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
            '<div style="position: relative; height: 520px;"><MvCatalogDropdown v-bind="args" @close="() => {}" @navigate="() => {}" /></div>',
    }),
};
