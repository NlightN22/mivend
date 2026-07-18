import type { Meta, StoryObj } from '@storybook/vue3';
import MvPanel from './MvPanel.vue';

const meta: Meta<typeof MvPanel> = {
    title: 'Molecules/MvPanel',
    component: MvPanel,
    tags: ['autodocs'],
    argTypes: {
        title: { control: 'text' },
    },
    args: { title: 'Recent orders' },
};

export default meta;
type Story = StoryObj<typeof MvPanel>;

export const Default: Story = {
    render: args => ({
        components: { MvPanel },
        setup: () => ({ args }),
        template:
            '<div style="max-width: 480px;"><MvPanel v-bind="args">Panel body content.</MvPanel></div>',
    }),
};

export const WithHeaderActions: Story = {
    render: () => ({
        components: { MvPanel },
        template: `
      <div style="max-width: 480px;">
        <MvPanel title="Recent orders">
          <template #header-actions><a href="#">View all</a></template>
          Panel body content.
        </MvPanel>
      </div>
    `,
    }),
};

export const NoTitle: Story = {
    args: { title: undefined },
    render: args => ({
        components: { MvPanel },
        setup: () => ({ args }),
        template:
            '<div style="max-width: 480px;"><MvPanel v-bind="args">Untitled panel content.</MvPanel></div>',
    }),
};
