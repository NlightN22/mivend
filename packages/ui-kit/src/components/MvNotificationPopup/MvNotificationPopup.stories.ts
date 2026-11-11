import type { Meta, StoryObj } from '@storybook/vue3';
import MvNotificationPopup from './MvNotificationPopup.vue';
import type { NotificationKind } from '../../composables/notificationTypes';

const KINDS: NotificationKind[] = ['info', 'success', 'warning', 'error'];

const meta: Meta<typeof MvNotificationPopup> = {
    title: 'Molecules/MvNotificationPopup',
    component: MvNotificationPopup,
    tags: ['autodocs'],
    argTypes: {
        message: { control: 'text' },
        title: { control: 'text' },
        kind: { control: 'select', options: KINDS },
    },
    args: {
        message: 'Order order-9001 has been approved.',
        kind: 'success',
    },
};

export default meta;
type Story = StoryObj<typeof MvNotificationPopup>;

export const Default: Story = {
    render: args => ({
        components: { MvNotificationPopup },
        setup: () => ({ args }),
        template: '<MvNotificationPopup v-bind="args" />',
    }),
};

export const WithTitle: Story = {
    args: { title: 'Payment', message: 'The amount changed, check the order.', kind: 'warning' },
};

export const AllKinds: Story = {
    render: () => ({
        components: { MvNotificationPopup },
        setup: () => ({ kinds: KINDS }),
        template: `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <MvNotificationPopup v-for="k in kinds" :key="k" :kind="k" :message="k + ' notification message'" />
      </div>
    `,
    }),
};
