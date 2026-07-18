import type { Meta, StoryObj } from '@storybook/vue3';
import MvDiscountBadge from './MvDiscountBadge.vue';
import type { DiscountTier } from './MvDiscountBadge.vue';

const TIERS: DiscountTier[] = [
    { percent: 5, minWeightKg: 50, minAmount: null },
    { percent: 10, minWeightKg: 200, minAmount: null },
    { percent: 15, minWeightKg: 500, minAmount: null },
];

const meta: Meta<typeof MvDiscountBadge> = {
    title: 'Atoms/MvDiscountBadge',
    component: MvDiscountBadge,
    tags: ['autodocs'],
    argTypes: {
        size: { control: 'select', options: ['sm', 'md'] },
        title: { control: 'text' },
    },
    args: {
        tiers: TIERS,
        size: 'md',
        title: 'Volume discount',
    },
};

export default meta;
type Story = StoryObj<typeof MvDiscountBadge>;

export const Default: Story = {
    render: args => ({
        components: { MvDiscountBadge },
        setup: () => ({ args }),
        template: '<MvDiscountBadge v-bind="args" />',
    }),
};

export const Small: Story = {
    args: { size: 'sm' },
    render: args => ({
        components: { MvDiscountBadge },
        setup: () => ({ args }),
        template: '<MvDiscountBadge v-bind="args" />',
    }),
};

export const AmountBasedTiers: Story = {
    args: {
        tiers: [
            { percent: 3, minWeightKg: null, minAmount: 5000000 },
            { percent: 7, minWeightKg: null, minAmount: 15000000 },
        ],
    },
    render: args => ({
        components: { MvDiscountBadge },
        setup: () => ({ args }),
        template: '<MvDiscountBadge v-bind="args" />',
    }),
};

export const NoTiers: Story = {
    args: { tiers: [] },
    render: args => ({
        components: { MvDiscountBadge },
        setup: () => ({ args }),
        template: '<div>Renders nothing when no tiers: <MvDiscountBadge v-bind="args" /></div>',
    }),
};
