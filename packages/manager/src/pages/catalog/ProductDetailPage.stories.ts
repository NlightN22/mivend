import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import ProductDetailPage from './ProductDetailPage.vue';

const meta: Meta<typeof ProductDetailPage> = {
    title: 'Pages/Catalog/ProductDetailPage',
    component: ProductDetailPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ProductDetailPage>;

function mockProductDetailData(): void {
    registerMock('ProductBySlug', () => ({
        product: {
            id: '1',
            name: 'Brake pad set',
            slug: 'brake-pad-set',
            facetValues: [{ id: '1', name: 'Bosch', facet: { code: 'brand' } }],
            variants: [{ id: '1', sku: 'SKU-001', stockLevels: [{ stockOnHand: 12 }] }],
        },
    }));
    registerMock('ProductCrossReferences', () => ({
        productCrossReferences: [{ oemCode: '1234-5678', oemBrand: 'OEM-Brand' }],
    }));
    registerMock('PriceTypeCodes', () => ({ priceTypeCodes: ['price-type-wholesale'] }));
}

export const Default: Story = {
    loaders: [
        async () => {
            mockProductDetailData();
            await router.push('/catalog/brake-pad-set');
        },
    ],
    render: () => ({
        components: { ProductDetailPage },
        template: '<ProductDetailPage />',
    }),
};
