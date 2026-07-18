import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { paginate, includesCi } from '../../../.storybook/mock-list-utils';
import CatalogPage from './CatalogPage.vue';

const meta: Meta<typeof CatalogPage> = {
    title: 'Pages/Catalog/CatalogPage',
    component: CatalogPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CatalogPage>;

const PRODUCTS = [
    {
        productId: '1',
        productVariantId: '1',
        productName: 'Brake pad set',
        sku: 'SKU-001',
        slug: 'brake-pad-set',
        facetValueIds: ['brand-bosch', 'category-brakes'],
        productAsset: null,
    },
    {
        productId: '2',
        productVariantId: '2',
        productName: 'Oil filter',
        sku: 'SKU-002',
        slug: 'oil-filter',
        facetValueIds: ['brand-mann', 'category-filters'],
        productAsset: null,
    },
    {
        productId: '3',
        productVariantId: '3',
        productName: 'Brake disc',
        sku: 'SKU-003',
        slug: 'brake-disc',
        facetValueIds: ['brand-bosch', 'category-brakes'],
        productAsset: null,
    },
    {
        productId: '4',
        productVariantId: '4',
        productName: 'Air filter',
        sku: 'SKU-004',
        slug: 'air-filter',
        facetValueIds: ['brand-mann', 'category-filters'],
        productAsset: null,
    },
    {
        productId: '5',
        productVariantId: '5',
        productName: 'Spark plug',
        sku: 'SKU-005',
        slug: 'spark-plug',
        facetValueIds: ['brand-ngk', 'category-ignition'],
        productAsset: null,
    },
];

interface FacetValueOrFilter {
    or: string[];
}

interface CatalogPageVariables {
    term?: string;
    facetValueFilters?: FacetValueOrFilter[];
    skip?: number;
    take?: number;
}

function mockCatalogData(): void {
    registerMock('CategoryTree', () => ({
        collections: {
            items: [
                {
                    id: '1',
                    name: 'Brakes',
                    slug: 'brakes',
                    breadcrumbs: [
                        { id: '0', name: 'Root', slug: 'root' },
                        { id: '1', name: 'Brakes', slug: 'brakes' },
                    ],
                    children: [],
                },
                {
                    id: '2',
                    name: 'Filters',
                    slug: 'filters',
                    breadcrumbs: [
                        { id: '0', name: 'Root', slug: 'root' },
                        { id: '2', name: 'Filters', slug: 'filters' },
                    ],
                    children: [],
                },
            ],
        },
    }));
    registerMock('CatalogFacets', () => ({
        search: {
            facetValues: [
                {
                    facetValue: {
                        id: 'brand-bosch',
                        code: 'bosch',
                        name: 'Bosch',
                        facet: { code: 'brand', name: 'Brand' },
                    },
                    count: 2,
                },
                {
                    facetValue: {
                        id: 'brand-mann',
                        code: 'mann',
                        name: 'Mann',
                        facet: { code: 'brand', name: 'Brand' },
                    },
                    count: 2,
                },
                {
                    facetValue: {
                        id: 'brand-ngk',
                        code: 'ngk',
                        name: 'NGK',
                        facet: { code: 'brand', name: 'Brand' },
                    },
                    count: 1,
                },
                {
                    facetValue: {
                        id: 'category-brakes',
                        code: 'brakes',
                        name: 'Brakes',
                        facet: { code: 'category', name: 'Category' },
                    },
                    count: 2,
                },
                {
                    facetValue: {
                        id: 'category-filters',
                        code: 'filters',
                        name: 'Filters',
                        facet: { code: 'category', name: 'Category' },
                    },
                    count: 2,
                },
                {
                    facetValue: {
                        id: 'category-ignition',
                        code: 'ignition',
                        name: 'Ignition',
                        facet: { code: 'category', name: 'Category' },
                    },
                    count: 1,
                },
            ],
        },
    }));
    registerMock('CatalogPage', (variables: CatalogPageVariables) => {
        let filtered = PRODUCTS;
        if (variables.term) {
            filtered = filtered.filter(
                p =>
                    includesCi(p.productName, variables.term!) ||
                    includesCi(p.sku, variables.term!),
            );
        }
        for (const group of variables.facetValueFilters ?? []) {
            filtered = filtered.filter(p => p.facetValueIds.some(id => group.or.includes(id)));
        }
        return { search: paginate(filtered, variables) };
    });
    registerMock('CatalogVariantStock', (variables: { ids?: string[] }) => ({
        productVariants: {
            items: (variables.ids ?? PRODUCTS.map(p => p.productVariantId)).map(id => ({
                id,
                stockLevels: [{ stockOnHand: 12 }],
            })),
        },
    }));
    registerMock('PriceTypeCodes', () => ({ priceTypeCodes: ['price-type-wholesale'] }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockCatalogData();
            await router.push('/catalog');
        },
    ],
    render: () => ({
        components: { CatalogPage },
        template: '<CatalogPage />',
    }),
};

export const Empty: Story = {
    loaders: [
        async () => {
            registerMock('CategoryTree', () => ({ collections: { items: [] } }));
            registerMock('CatalogFacets', () => ({ search: { facetValues: [] } }));
            registerMock('CatalogPage', () => ({ search: { items: [], totalItems: 0 } }));
            registerMock('CatalogVariantStock', () => ({ productVariants: { items: [] } }));
            registerMock('PriceTypeCodes', () => ({ priceTypeCodes: [] }));
            await router.push('/catalog');
        },
    ],
    render: () => ({
        components: { CatalogPage },
        template: '<CatalogPage />',
    }),
};
