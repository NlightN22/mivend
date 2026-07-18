import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import { buildSearchItem } from '../../../.storybook/fixtures';
import CatalogPage from './CatalogPage.vue';

const meta: Meta<typeof CatalogPage> = {
    title: 'Pages/Catalog/CatalogPage',
    component: CatalogPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CatalogPage>;

const facetValues = [
    {
        facetValue: {
            id: 'fv-1',
            code: 'brakes',
            name: 'Brakes',
            facet: { code: 'category', name: 'Category' },
        },
        count: 2,
    },
    {
        facetValue: {
            id: 'fv-2',
            code: 'filters',
            name: 'Filters',
            facet: { code: 'category', name: 'Category' },
        },
        count: 1,
    },
];

function mockSearch(): void {
    registerMock('CatalogProducts', () => ({
        search: {
            totalItems: 2,
            items: [
                buildSearchItem(),
                buildSearchItem({
                    productId: 'prod-2',
                    productVariantId: 'var-2',
                    productName: 'Oil filter',
                    slug: 'oil-filter',
                    sku: 'sku-10022',
                    priceWithTax: { value: 90000 },
                    facetValueIds: ['fv-2'],
                }),
            ],
            facetValues,
        },
    }));
    registerMock('CatalogFacets', () => ({
        search: { facetValues },
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            mockSearch();
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
            registerDefaultMocks();
            registerMock('CatalogProducts', () => ({
                search: { totalItems: 0, items: [], facetValues: [] },
            }));
            registerMock('CatalogFacets', () => ({ search: { facetValues: [] } }));
            await router.push('/catalog');
        },
    ],
    render: () => ({
        components: { CatalogPage },
        template: '<CatalogPage />',
    }),
};
