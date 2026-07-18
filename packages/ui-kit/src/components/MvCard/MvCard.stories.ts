import type { Meta, StoryObj } from '@storybook/vue3';
import MvCard from './MvCard.vue';

const meta: Meta<typeof MvCard> = {
    title: 'Atoms/MvCard',
    component: MvCard,
    tags: ['autodocs'],
    argTypes: {
        padding: { control: 'text' },
        shadow: { control: 'boolean' },
    },
    args: {
        padding: '20px',
        shadow: true,
    },
};

export default meta;
type Story = StoryObj<typeof MvCard>;

export const Default: Story = {
    render: args => ({
        components: { MvCard },
        setup: () => ({ args }),
        template: '<MvCard v-bind="args">Card content goes here.</MvCard>',
    }),
};

export const NoShadow: Story = {
    args: { shadow: false },
    render: args => ({
        components: { MvCard },
        setup: () => ({ args }),
        template: '<MvCard v-bind="args">Flat card without shadow.</MvCard>',
    }),
};

export const TightPadding: Story = {
    args: { padding: '8px' },
    render: args => ({
        components: { MvCard },
        setup: () => ({ args }),
        template: '<MvCard v-bind="args">Compact card.</MvCard>',
    }),
};
