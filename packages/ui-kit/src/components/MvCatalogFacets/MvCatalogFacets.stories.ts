import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvCatalogFacets from './MvCatalogFacets.vue';

const FACET_GROUPS = [
    {
        code: 'brand',
        name: 'Brand',
        values: [
            { id: 'brand-1', name: 'brand-1', count: 42 },
            { id: 'brand-2', name: 'brand-2', count: 18 },
        ],
    },
    {
        code: 'category',
        name: 'Category',
        values: [
            { id: 'cat-1', name: 'Brake system', count: 60 },
            { id: 'cat-2', name: 'Engine', count: 25 },
        ],
    },
];

const meta: Meta<typeof MvCatalogFacets> = {
    title: 'Organisms/MvCatalogFacets',
    component: MvCatalogFacets,
    tags: ['autodocs'],
    args: {
        facetGroups: FACET_GROUPS,
        inStockOnly: false,
        selectedFacetValues: new Set<string>(),
        priceMin: null,
        priceMax: null,
    },
};

export default meta;
type Story = StoryObj<typeof MvCatalogFacets>;

export const Default: Story = {
    render: args => ({
        components: { MvCatalogFacets },
        setup: () => {
            const inStockOnly = ref(args.inStockOnly);
            const selected = ref(new Set(args.selectedFacetValues));
            return { args, inStockOnly, selected };
        },
        template: `
      <div style="max-width: 280px;">
        <MvCatalogFacets
          :facet-groups="args.facetGroups"
          :in-stock-only="inStockOnly"
          :selected-facet-values="selected"
          :price-min="args.priceMin"
          :price-max="args.priceMax"
          @update:in-stock-only="inStockOnly = $event"
          @toggle-facet-value="() => {}"
          @update:price-min="() => {}"
          @update:price-max="() => {}"
          @reset="() => {}"
        />
      </div>
    `,
    }),
};

export const WithSelectedValues: Story = {
    args: { selectedFacetValues: new Set(['brand-1']), priceMin: 500, priceMax: 5000 },
    render: args => ({
        components: { MvCatalogFacets },
        setup: () => ({ args }),
        template: `
      <div style="max-width: 280px;">
        <MvCatalogFacets v-bind="args" @update:in-stock-only="() => {}" @toggle-facet-value="() => {}" @update:price-min="() => {}" @update:price-max="() => {}" @reset="() => {}" />
      </div>
    `,
    }),
};

export const ManagerView: Story = {
    args: { hiddenFacetCodes: [] },
    render: args => ({
        components: { MvCatalogFacets },
        setup: () => ({ args }),
        template: `
      <div style="max-width: 280px;">
        <MvCatalogFacets v-bind="args" @update:in-stock-only="() => {}" @toggle-facet-value="() => {}" @update:price-min="() => {}" @update:price-max="() => {}" @reset="() => {}" />
      </div>
    `,
    }),
};
