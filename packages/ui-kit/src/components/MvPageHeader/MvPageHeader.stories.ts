import type { Meta, StoryObj } from '@storybook/vue3';
import MvPageHeader from './MvPageHeader.vue';

const meta: Meta<typeof MvPageHeader> = {
    title: 'Components/MvPageHeader',
    component: MvPageHeader,
    tags: ['autodocs'],
    argTypes: {
        title: { control: 'text' },
    },
    args: {
        title: 'My Orders',
    },
};

export default meta;
type Story = StoryObj<typeof MvPageHeader>;

export const Default: Story = {
    render: args => ({
        components: { MvPageHeader },
        setup: () => ({ args }),
        template:
            '<div style="padding:24px;background:#F6F8FB;"><MvPageHeader v-bind="args" /></div>',
    }),
};

export const WithBreadcrumbs: Story = {
    render: () => ({
        components: { MvPageHeader },
        template: `
      <div style="padding:24px;background:#F6F8FB;">
        <MvPageHeader
          title="Order #10042"
          :breadcrumbs="[
            { label: 'Home', to: '/' },
            { label: 'Orders', to: '/orders' },
            { label: 'Order #10042' }
          ]"
        />
      </div>
    `,
    }),
};

export const NoBreadcrumbs: Story = {
    render: () => ({
        components: { MvPageHeader },
        template: `
      <div style="padding:24px;background:#F6F8FB;">
        <MvPageHeader title="Product catalog" />
      </div>
    `,
    }),
};

export const LongTitle: Story = {
    render: () => ({
        components: { MvPageHeader },
        template: `
      <div style="padding:24px;background:#F6F8FB;max-width:640px;">
        <MvPageHeader
          title="Search results for: brake pads bosch 0986494063 front axle"
          :breadcrumbs="[{ label: 'Home', to: '/' }, { label: 'Search' }]"
        />
      </div>
    `,
    }),
};
