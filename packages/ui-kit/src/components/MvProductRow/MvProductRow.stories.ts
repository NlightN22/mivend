import type { Meta, StoryObj } from '@storybook/vue3';
import MvProductRow from './MvProductRow.vue';

const meta: Meta<typeof MvProductRow> = {
    title: 'Organisms/MvProductRow',
    component: MvProductRow,
    tags: ['autodocs'],
    args: {
        name: 'Brake pad set — front axle',
        sku: 'sku-10021',
        brand: 'brand-1',
        price: 249000,
        customerPrice: 219000,
        oldPrice: 289000,
        currency: 'RUB',
        stock: 42,
        stockVariant: 'ok',
        multiplicity: 1,
        slug: 'brake-pad-set-front-axle',
        showPrices: true,
        variantId: 'variant-1',
        cartQty: 0,
        isFavorited: false,
        showFavorite: true,
        showActions: true,
    },
};

export default meta;
type Story = StoryObj<typeof MvProductRow>;

export const Default: Story = {
    render: args => ({
        components: { MvProductRow },
        setup: () => ({ args }),
        template: '<div style="max-width: 900px;"><MvProductRow v-bind="args" /></div>',
    }),
};

export const WithFloorPrice: Story = {
    args: { showFloorPrice: true, floorPrice: 200000 },
    render: args => ({
        components: { MvProductRow },
        setup: () => ({ args }),
        template: '<div style="max-width: 900px;"><MvProductRow v-bind="args" /></div>',
    }),
};

export const OutOfStock: Story = {
    args: { stockVariant: 'out', stock: 0 },
    render: args => ({
        components: { MvProductRow },
        setup: () => ({ args }),
        template: '<div style="max-width: 900px;"><MvProductRow v-bind="args" /></div>',
    }),
};

export const ViewOnly: Story = {
    args: { showActions: false, showFavorite: false },
    render: args => ({
        components: { MvProductRow },
        setup: () => ({ args }),
        template: '<div style="max-width: 900px;"><MvProductRow v-bind="args" /></div>',
    }),
};
