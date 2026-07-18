import type { Meta, StoryObj } from '@storybook/vue3';
import { router } from '../../router';
import { registerDefaultMocks } from '../../../.storybook/default-mocks';
import TradingPointsPage from './TradingPointsPage.vue';

const meta: Meta<typeof TradingPointsPage> = {
    title: 'Pages/Account/TradingPointsPage',
    component: TradingPointsPage,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof TradingPointsPage>;

// useTradingPoints.ts fetches via a raw, unnamed GraphQL query (bypasses codegen — pre-existing
// tech debt), so the operation-name-keyed mock registry can't intercept it; the page always
// renders with empty trading-point lists in Storybook until that file adopts codegen.
export const Default: Story = {
    loaders: [
        async () => {
            registerDefaultMocks();
            await router.push('/account/trading-points');
        },
    ],
    render: () => ({
        components: { TradingPointsPage },
        template: '<TradingPointsPage />',
    }),
};
