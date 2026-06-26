import type { Meta, StoryObj } from '@storybook/vue3';
import MvAmountDisplay from './MvAmountDisplay.vue';
import type { AmountSize } from './MvAmountDisplay.vue';

const SIZES: AmountSize[] = ['sm', 'md', 'lg'];

const meta: Meta<typeof MvAmountDisplay> = {
    title: 'Atoms/MvAmountDisplay',
    component: MvAmountDisplay,
    tags: ['autodocs'],
    argTypes: {
        amount: { control: 'number' },
        currency: { control: 'text' },
        size: { control: 'select', options: SIZES },
    },
    args: {
        amount: 2940,
        currency: '₽',
        size: 'md',
    },
};

export default meta;
type Story = StoryObj<typeof MvAmountDisplay>;

export const Default: Story = {
    render: args => ({
        components: { MvAmountDisplay },
        setup: () => ({ args }),
        template: '<MvAmountDisplay v-bind="args" />',
    }),
};

export const AllSizes: Story = {
    render: () => ({
        components: { MvAmountDisplay },
        setup: () => ({ sizes: SIZES }),
        template: `
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 24px;">
        <div v-for="s in sizes" :key="s" style="display: flex; align-items: center; gap: 12px;">
          <span style="width: 28px; font-size: 12px; color: #667085;">{{ s }}</span>
          <MvAmountDisplay :amount="2940" currency="₽" :size="s" />
        </div>
      </div>
    `,
    }),
};

export const EdgeCases: Story = {
    render: () => ({
        components: { MvAmountDisplay },
        template: `
      <div style="display: flex; flex-direction: column; gap: 12px; padding: 24px;">
        <div v-for="c in cases" :key="c.label" style="display: flex; align-items: center; gap: 12px; font-size: 13px; color: #667085;">
          <span style="width: 120px;">{{ c.label }}</span>
          <MvAmountDisplay :amount="c.amount" :currency="c.currency" :size="c.size" />
        </div>
      </div>
    `,
        setup() {
            return {
                cases: [
                    { label: 'Zero', amount: 0, currency: '₽', size: 'md' as AmountSize },
                    { label: 'Large', amount: 1234567.89, currency: '₽', size: 'lg' as AmountSize },
                    { label: 'Tiny', amount: 0.01, currency: '₽', size: 'sm' as AmountSize },
                    { label: 'USD', amount: 49.99, currency: '$', size: 'md' as AmountSize },
                    { label: 'Negative', amount: -500, currency: '₽', size: 'md' as AmountSize },
                    {
                        label: 'Millions',
                        amount: 9999999.99,
                        currency: '₽',
                        size: 'lg' as AmountSize,
                    },
                ],
            };
        },
    }),
};

export const InProductTable: Story = {
    render: () => ({
        components: { MvAmountDisplay },
        template: `
      <div style="padding: 24px; background: #fff; border-radius: 12px; max-width: 480px;">
        <div
          v-for="row in rows"
          :key="row.article"
          style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #EEF2F6; font-size: 14px;"
        >
          <div>
            <div style="font-weight: 600; color: #17212B;">{{ row.article }}</div>
            <div style="font-size: 12px; color: #667085; margin-top: 2px;">{{ row.name }}</div>
          </div>
          <MvAmountDisplay :amount="row.price" currency="₽" size="md" />
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 16px; font-weight: 700;">
          <span>Total</span>
          <MvAmountDisplay :amount="5540" currency="₽" size="lg" />
        </div>
      </div>
    `,
        setup() {
            return {
                rows: [
                    { article: 'OC90', name: 'Oil filter', price: 420 },
                    { article: '0986494063', name: 'Brake pads front', price: 2940 },
                    { article: '5W40-4L', name: 'Motor oil 4L', price: 2180 },
                ],
            };
        },
    }),
};
