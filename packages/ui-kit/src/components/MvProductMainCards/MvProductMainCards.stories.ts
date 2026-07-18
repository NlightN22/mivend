import type { Meta, StoryObj } from '@storybook/vue3';
import MvProductMainCards from './MvProductMainCards.vue';

const RELATED = [
    {
        id: 'product-2',
        name: 'Brake pad set — rear axle',
        slug: 'brake-pad-set-rear-axle',
        variants: [{ price: 219000, currencyCode: 'RUB', stockLevel: 'IN_STOCK' }],
        facetValues: [{ name: 'brand-1', facet: { code: 'brand' } }],
    },
    {
        id: 'product-3',
        name: 'Brake disc — front axle',
        slug: 'brake-disc-front-axle',
        variants: [{ price: 340000, currencyCode: 'RUB', stockLevel: 'OUT_OF_STOCK' }],
        facetValues: [{ name: 'brand-2', facet: { code: 'brand' } }],
    },
];

const meta: Meta<typeof MvProductMainCards> = {
    title: 'Organisms/MvProductMainCards',
    component: MvProductMainCards,
    tags: ['autodocs'],
    args: {
        name: 'Brake pad set — front axle',
        sku: 'sku-10021',
        description: 'Ceramic brake pad set for front axle, fits multiple vehicle models.',
        brand: 'brand-1',
        category: 'Brake system',
        stockVariantLabel: 'ok',
        related: RELATED,
        showRelatedPrices: true,
        showAddToCartButton: true,
    },
};

export default meta;
type Story = StoryObj<typeof MvProductMainCards>;

export const Default: Story = {
    render: args => ({
        components: { MvProductMainCards },
        setup: () => ({ args }),
        template: '<MvProductMainCards v-bind="args" />',
    }),
};

export const GuestNoPrices: Story = {
    args: { showRelatedPrices: false, showAddToCartButton: false },
    render: args => ({
        components: { MvProductMainCards },
        setup: () => ({ args }),
        template: '<MvProductMainCards v-bind="args" />',
    }),
};

export const NoRelatedProducts: Story = {
    args: { related: [] },
    render: args => ({
        components: { MvProductMainCards },
        setup: () => ({ args }),
        template: '<MvProductMainCards v-bind="args" />',
    }),
};
