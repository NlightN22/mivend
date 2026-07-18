import type { Meta, StoryObj } from '@storybook/vue3';
import MvToast from './MvToast.vue';
import type { NoticeVariant } from '../MvNotice/MvNotice.vue';

const VARIANTS: NoticeVariant[] = ['info', 'success', 'warning', 'error'];

const meta: Meta<typeof MvToast> = {
    title: 'Molecules/MvToast',
    component: MvToast,
    tags: ['autodocs'],
    argTypes: {
        message: { control: 'text' },
        variant: { control: 'select', options: VARIANTS },
    },
    args: {
        message: 'Order order-9001 has been approved.',
        variant: 'success',
    },
};

export default meta;
type Story = StoryObj<typeof MvToast>;

export const Default: Story = {
    render: args => ({
        components: { MvToast },
        setup: () => ({ args }),
        template: '<MvToast v-bind="args" />',
    }),
};

export const AllVariants: Story = {
    render: () => ({
        components: { MvToast },
        setup: () => ({ variants: VARIANTS }),
        template: `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <MvToast v-for="v in variants" :key="v" :variant="v" :message="v + ' toast message'" />
      </div>
    `,
    }),
};
