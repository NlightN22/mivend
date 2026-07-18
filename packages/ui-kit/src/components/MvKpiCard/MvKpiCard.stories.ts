import type { Meta, StoryObj } from '@storybook/vue3';
import MvKpiCard from './MvKpiCard.vue';

const meta: Meta<typeof MvKpiCard> = {
    title: 'Molecules/MvKpiCard',
    component: MvKpiCard,
    tags: ['autodocs'],
    argTypes: {
        label: { control: 'text' },
        value: { control: 'text' },
        caption: { control: 'text' },
        to: { control: 'text' },
        accent: { control: 'boolean' },
    },
    args: {
        label: 'Outstanding balance',
        value: '1 240 500 ₽',
        caption: '+12% vs last month',
        accent: false,
    },
};

export default meta;
type Story = StoryObj<typeof MvKpiCard>;

export const Default: Story = {
    render: args => ({
        components: { MvKpiCard },
        setup: () => ({ args }),
        template: '<div style="max-width: 260px;"><MvKpiCard v-bind="args" /></div>',
    }),
};

export const Clickable: Story = {
    args: { to: '/orders' },
    render: args => ({
        components: { MvKpiCard },
        setup: () => ({ args }),
        template: '<div style="max-width: 260px;"><MvKpiCard v-bind="args" /></div>',
    }),
};

export const Accent: Story = {
    args: { accent: true, label: 'Available credit', value: '350 000 ₽' },
    render: args => ({
        components: { MvKpiCard },
        setup: () => ({ args }),
        template: '<div style="max-width: 260px;"><MvKpiCard v-bind="args" /></div>',
    }),
};

export const Row: Story = {
    render: () => ({
        components: { MvKpiCard },
        template: `
      <div style="display: flex; gap: 16px; max-width: 900px;">
        <MvKpiCard label="Orders this month" :value="128" caption="branch-a" style="flex: 1;" />
        <MvKpiCard label="Outstanding balance" value="1 240 500 ₽" accent style="flex: 1;" />
        <MvKpiCard label="Available credit" value="350 000 ₽" to="/credit" style="flex: 1;" />
      </div>
    `,
    }),
};
