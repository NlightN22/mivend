import type { Meta, StoryObj } from '@storybook/vue3';
import MvStatusTag from './MvStatusTag.vue';
import type { StatusTagVariant } from './MvStatusTag.vue';

const VARIANTS: StatusTagVariant[] = [
    'in-stock',
    'low-stock',
    'by-order',
    'promo',
    'analog',
    'original',
    'in-cart',
    'reserved',
    'unavailable',
];

const meta: Meta<typeof MvStatusTag> = {
    title: 'Atoms/MvStatusTag',
    component: MvStatusTag,
    tags: ['autodocs'],
    argTypes: {
        variant: { control: 'select', options: VARIANTS },
    },
    args: {
        variant: 'in-stock',
    },
};

export default meta;
type Story = StoryObj<typeof MvStatusTag>;

export const Default: Story = {
    render: args => ({
        components: { MvStatusTag },
        setup: () => ({ args }),
        template: '<MvStatusTag v-bind="args" />',
    }),
};

export const AllVariants: Story = {
    render: () => ({
        components: { MvStatusTag },
        setup: () => ({ variants: VARIANTS }),
        template: `
      <div style="display: flex; flex-wrap: wrap; gap: 10px; padding: 24px;">
        <MvStatusTag v-for="v in variants" :key="v" :variant="v" />
      </div>
    `,
    }),
};

export const WithCustomSlot: Story = {
    render: () => ({
        components: { MvStatusTag },
        template: `
      <div style="display: flex; flex-wrap: wrap; gap: 10px; padding: 24px;">
        <MvStatusTag variant="in-stock">42 pcs.</MvStatusTag>
        <MvStatusTag variant="low-stock">3 left</MvStatusTag>
        <MvStatusTag variant="by-order">~5 days</MvStatusTag>
        <MvStatusTag variant="in-cart">2 in cart</MvStatusTag>
      </div>
    `,
    }),
};

export const InProductTable: Story = {
    render: () => ({
        components: { MvStatusTag },
        template: `
      <div style="padding: 24px; background: #fff; border-radius: 12px; max-width: 560px;">
        <div
          v-for="row in rows"
          :key="row.article"
          style="display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid #EEF2F6; font-size: 14px;"
        >
          <span style="width: 110px; font-weight: 600; color: #17212B;">{{ row.article }}</span>
          <span style="flex: 1; color: #344054;">{{ row.name }}</span>
          <MvStatusTag :variant="row.status" />
        </div>
      </div>
    `,
        setup() {
            return {
                rows: [
                    { article: 'OC90', name: 'Oil filter', status: 'in-stock' as StatusTagVariant },
                    {
                        article: '0986494063',
                        name: 'Brake pads front',
                        status: 'low-stock' as StatusTagVariant,
                    },
                    {
                        article: '5W40-4L',
                        name: 'Motor oil 4L',
                        status: 'in-cart' as StatusTagVariant,
                    },
                    {
                        article: 'CR-35L',
                        name: 'Air filter',
                        status: 'by-order' as StatusTagVariant,
                    },
                    {
                        article: 'BX-7710',
                        name: 'Timing belt kit',
                        status: 'unavailable' as StatusTagVariant,
                    },
                ],
            };
        },
    }),
};
