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

const many = (n: number): ReturnType<typeof item>[] =>
    Array.from({ length: n }, (_, i) => item(`c${i}`, `Category ${i + 1}`));

export const ChildrenWithBackRows: Story = {
    args: {
        panel: {
            current: item('oils', 'Engine oils'),
            ancestors: [item('parts', 'Parts'), item('engine', 'Engine')],
            level: [item('mineral', 'Mineral oils'), item('synthetic', 'Synthetic oils')],
            levelIsChildren: true,
        },
    },
};

export const LeafWithSiblings: Story = {
    args: {
        panel: {
            current: item('belts', 'Belts'),
            ancestors: [item('engine', 'Engine')],
            level: [
                item('oils', 'Engine oils'),
                item('belts', 'Belts'),
                item('filters', 'Filters'),
            ],
            levelIsChildren: false,
        },
    },
};

export const TopLevelCappedWithMore: Story = {
    args: { panel: { ancestors: [], level: many(12), levelIsChildren: false } },
};
