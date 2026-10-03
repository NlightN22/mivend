import type { Meta, StoryObj } from '@storybook/vue3';
import MvCategoryNav from './MvCategoryNav.vue';

const item = (id: string, name: string): { id: string; name: string; slug: string } => ({
    id,
    name,
    slug: id,
});

const meta: Meta<typeof MvCategoryNav> = {
    title: 'Molecules/MvCategoryNav',
    component: MvCategoryNav,
    tags: ['autodocs'],
    decorators: [() => ({ template: '<div style="max-width: 240px;"><story /></div>' })],
};

export default meta;
type Story = StoryObj<typeof MvCategoryNav>;

export const WithSiblingsAndChildren: Story = {
    args: {
        panel: {
            current: item('oils', 'Engine oils'),
            siblings: [
                item('belts', 'Belts'),
                item('oils', 'Engine oils'),
                item('filters', 'Filters'),
            ],
            children: [item('mineral', 'Mineral oils'), item('synthetic', 'Synthetic oils')],
        },
    },
};

export const TopLevelList: Story = {
    args: {
        panel: { siblings: [], children: [item('engine', 'Engine'), item('brakes', 'Brakes')] },
    },
};
