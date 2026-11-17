import type { Meta, StoryObj } from '@storybook/vue3';
import MvLineChangeCell from './MvLineChangeCell.vue';

const meta: Meta<typeof MvLineChangeCell> = {
    title: 'Molecules/MvLineChangeCell',
    component: MvLineChangeCell,
    tags: ['autodocs'],
    args: {
        ordered: 10,
        actual: 5,
        heading: 'Changes of the line',
        productName: 'Sample product',
        sku: 'SKU-1',
        footer: 'Line total: actually received 5 of 10',
        infoLabel: 'Show changes',
        events: [
            {
                kind: 'realization',
                title: 'Realization',
                subtitle: 'Shipped from the warehouse',
                quantity: 8,
                remainder: 8,
            },
            {
                kind: 'realization-correction',
                title: 'Realization correction',
                subtitle: 'Quantity decreased',
                quantity: -1,
                remainder: 7,
            },
            {
                kind: 'return',
                title: 'Return',
                subtitle: 'Return from the customer',
                quantity: -2,
                remainder: 5,
            },
        ],
    },
};

export default meta;
export const Default: StoryObj<typeof MvLineChangeCell> = {};
