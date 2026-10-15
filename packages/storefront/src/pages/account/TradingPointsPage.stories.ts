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

// Unnamed raw GraphQL query skips codegen, so the name-keyed mock registry can't intercept it.
// Storybook renders empty trading-point lists until useTradingPoints.ts adopts codegen.
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
