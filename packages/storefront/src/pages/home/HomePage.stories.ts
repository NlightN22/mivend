import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerMock } from '../../../.storybook/graphql-mock-registry';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import { buildWidgetProduct, buildSearchItem } from '../../../.storybook/fixtures';
import HomePage from './HomePage.vue';

const meta: Meta<typeof HomePage> = {
    title: 'Pages/Home/HomePage',
    component: HomePage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HomePage>;

export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            registerMock('CatalogProducts', () => ({
                search: {
                    totalItems: 1,
                    items: [buildSearchItem()],
                    facetValues: [],
                },
            }));
            registerMock('CatalogFacets', () => ({
                search: { facetValues: [] },
            }));
            registerMock('NewArrivalProductIds', () => ({ newArrivalProductIds: ['prod-1'] }));
            registerMock('SaleProductIds', () => ({ saleProductIds: ['prod-2'] }));
            registerMock('PopularProductIds', () => ({ popularProductIds: ['prod-1'] }));
            registerMock('WidgetProducts', () => ({
                products: {
                    items: [
                        buildWidgetProduct(),
                        buildWidgetProduct({
                            id: 'prod-2',
                            name: 'Oil filter',
                            slug: 'oil-filter',
                        }),
                    ],
                },
            }));
            await router.push('/');
        },
    ],
    render: () => ({
        components: { HomePage },
        template: '<HomePage />',
    }),
};
