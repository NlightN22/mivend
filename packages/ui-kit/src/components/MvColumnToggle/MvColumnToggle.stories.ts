import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvColumnToggle from './MvColumnToggle.vue';
import type { ColumnVisibilityDef } from '../../composables/useColumnVisibility';

const COLUMNS: (ColumnVisibilityDef & { visible: boolean })[] = [
    { key: 'sku', label: 'SKU', visible: true },
    { key: 'brand', label: 'Brand', visible: true },
    { key: 'stock', label: 'Stock', visible: false },
    { key: 'price', label: 'Price', visible: true },
];

const meta: Meta<typeof MvColumnToggle> = {
    title: 'Molecules/MvColumnToggle',
    component: MvColumnToggle,
    tags: ['autodocs'],
    args: { columns: COLUMNS },
};

export default meta;
type Story = StoryObj<typeof MvColumnToggle>;

export const Default: Story = {
    render: args => ({
        components: { MvColumnToggle },
        setup: () => {
            const columns = ref(args.columns);
            function toggle(key: string): void {
                const col = columns.value.find(c => c.key === key);
                if (col) col.visible = !col.visible;
            }
            return { columns, toggle };
        },
        template: '<MvColumnToggle :columns="columns" @toggle="toggle" />',
    }),
};
