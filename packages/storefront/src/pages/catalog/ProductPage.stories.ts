import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import ProductPage from './ProductPage.vue';

const meta: Meta<typeof ProductPage> = {
    title: 'Pages/Catalog/ProductPage',
    component: ProductPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ProductPage>;

function mockProduct(): void {
    registerMock('ProductDetail', () => ({
        product: {
            id: 'prod-1',
            name: 'Brake pad set',
            slug: 'brake-pad-set',
            description: 'Front axle brake pad set, ceramic compound.',
            variants: [
                {
                    id: 'var-1',
                    sku: 'sku-10021',
                    price: 250000,
                    customerPrice: 230000,
                    compareAtPrice: 280000,
                    currencyCode: 'RUB',
                    stockLevel: 'IN_STOCK',
                },
            ],
            facetValues: [
                { name: 'Brakes', facet: { code: 'category' } },
                { name: 'BrandX', facet: { code: 'brand' } },
            ],
        },
    }));
    registerMock('RelatedProducts', () => ({
        products: {
            items: [
                {
                    id: 'prod-2',
                    name: 'Oil filter',
                    slug: 'oil-filter',
                    variants: [{ price: 90000, currencyCode: 'RUB', stockLevel: 'IN_STOCK' }],
                    facetValues: [{ name: 'Filters', facet: { code: 'category' } }],
                },
            ],
        },
    }));
}

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            mockProduct();
            await router.push('/product/brake-pad-set');
        },
    ],
    render: () => ({
        components: { ProductPage },
        template: '<ProductPage />',
    }),
};

export const NotFound: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('ProductDetail', () => ({ product: null }));
            registerMock('RelatedProducts', () => ({ products: { items: [] } }));
            await router.push('/product/unknown');
        },
    ],
    render: () => ({
        components: { ProductPage },
        template: '<ProductPage />',
    }),
};
