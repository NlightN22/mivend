import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import CatalogPage from './CatalogPage.vue';

const meta: Meta<typeof CatalogPage> = {
    title: 'Pages/Catalog/CatalogPage',
    component: CatalogPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CatalogPage>;

const ITEM = {
    productId: '1',
    productVariantId: '1',
    productName: 'Brake pad set',
    sku: 'SKU-001',
    slug: 'brake-pad-set',
    facetValueIds: ['1'],
    productAsset: null,
};

function mockCatalogData(items: (typeof ITEM)[], totalItems: number): void {
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
            ],
        },
    }));
    registerMock('CatalogFacets', () => ({
        search: {
            facetValues: [
                {
                    facetValue: {
                        id: '1',
                        code: 'brand',
                        name: 'Bosch',
                        facet: { code: 'brand', name: 'Brand' },
                    },
                    count: 3,
                },
            ],
        },
    }));
    registerMock('CatalogPage', () => ({
        search: { totalItems, items },
    }));
    registerMock('CatalogVariantStock', () => ({
        productVariants: {
            items: items.map(i => ({ id: i.productVariantId, stockLevels: [{ stockOnHand: 12 }] })),
        },
    }));
    registerMock('PriceTypeCodes', () => ({ priceTypeCodes: ['price-type-wholesale'] }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockCatalogData(
                [
                    ITEM,
                    {
                        ...ITEM,
                        productId: '2',
                        productVariantId: '2',
                        productName: 'Oil filter',
                        sku: 'SKU-002',
                    },
                ],
                2,
            );
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
            mockCatalogData([], 0);
            await router.push('/catalog');
        },
    ],
    render: () => ({
        components: { CatalogPage },
        template: '<CatalogPage />',
    }),
};
