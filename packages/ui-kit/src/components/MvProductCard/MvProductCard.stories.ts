import type { Meta, StoryObj } from '@storybook/vue3';
import MvProductCard from './MvProductCard.vue';

const meta: Meta<typeof MvProductCard> = {
    title: 'Organisms/MvProductCard',
    component: MvProductCard,
    tags: ['autodocs'],
    args: {
        name: 'Brake pad set — front axle',
        sku: 'sku-10021',
        brand: 'brand-1',
        price: 249000,
        compareAtPrice: 289000,
        customerPrice: 219000,
        currency: 'RUB',
        stockVariant: 'ok',
        stockQuantity: 42,
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
type Story = StoryObj<typeof MvProductCard>;

export const Default: Story = {
    render: args => ({
        components: { MvProductCard },
        setup: () => ({ args }),
        template: '<div style="max-width: 280px;"><MvProductCard v-bind="args" /></div>',
    }),
};

export const InCart: Story = {
    args: { cartQty: 3, cartLineId: 'line-1' },
    render: args => ({
        components: { MvProductCard },
        setup: () => ({ args }),
        template: '<div style="max-width: 280px;"><MvProductCard v-bind="args" /></div>',
    }),
};

export const OutOfStock: Story = {
    args: { stockVariant: 'out', stockQuantity: 0 },
    render: args => ({
        components: { MvProductCard },
        setup: () => ({ args }),
        template: '<div style="max-width: 280px;"><MvProductCard v-bind="args" /></div>',
    }),
};

export const WithDiscountTiers: Story = {
    args: {
        discountTiers: [
            { percent: 5, minWeightKg: 50, minAmount: null },
            { percent: 10, minWeightKg: 200, minAmount: null },
        ],
    },
    render: args => ({
        components: { MvProductCard },
        setup: () => ({ args }),
        template: '<div style="max-width: 280px;"><MvProductCard v-bind="args" /></div>',
    }),
};

export const NoPricesGuest: Story = {
    args: { showPrices: false },
    render: args => ({
        components: { MvProductCard },
        setup: () => ({ args }),
        template: '<div style="max-width: 280px;"><MvProductCard v-bind="args" /></div>',
    }),
};

export const ViewOnly: Story = {
    args: { showActions: false, showFavorite: false },
    render: args => ({
        components: { MvProductCard },
        setup: () => ({ args }),
        template: '<div style="max-width: 280px;"><MvProductCard v-bind="args" /></div>',
    }),
};
