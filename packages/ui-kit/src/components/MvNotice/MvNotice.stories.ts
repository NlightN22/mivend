import type { Meta, StoryObj } from '@storybook/vue3';
import MvNotice from './MvNotice.vue';
import type { NoticeVariant } from './MvNotice.vue';

const VARIANTS: NoticeVariant[] = ['info', 'success', 'warning', 'error'];

const meta: Meta<typeof MvNotice> = {
    title: 'Atoms/MvNotice',
    component: MvNotice,
    tags: ['autodocs'],
    argTypes: {
        variant: { control: 'select', options: VARIANTS },
    },
    args: { variant: 'info' },
};

export default meta;
type Story = StoryObj<typeof MvNotice>;

export const Default: Story = {
    render: args => ({
        components: { MvNotice },
        setup: () => ({ args }),
        template: '<MvNotice v-bind="args">Prices are synced from the ERP nightly.</MvNotice>',
    }),
};

export const AllVariants: Story = {
    render: () => ({
        components: { MvNotice },
        setup: () => ({ variants: VARIANTS }),
        template: `
      <div style="display: flex; flex-direction: column; gap: 10px; max-width: 420px;">
        <MvNotice v-for="v in variants" :key="v" :variant="v">{{ v }} notice message.</MvNotice>
      </div>
    `,
    }),
};
