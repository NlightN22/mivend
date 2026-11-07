import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvSidePanel from './MvSidePanel.vue';
import MvButton from '../MvButton/MvButton.vue';

const meta: Meta<typeof MvSidePanel> = {
    title: 'Molecules/MvSidePanel',
    component: MvSidePanel,
    tags: ['autodocs'],
    argTypes: { title: { control: 'text' } },
    args: { title: 'Order 1001' },
};

export default meta;
type Story = StoryObj<typeof MvSidePanel>;

export const Default: Story = {
    render: args => ({
        components: { MvSidePanel, MvButton },
        setup: () => ({ args }),
        template: `
      <MvSidePanel v-bind="args">
        <p>Key data goes here.</p>
        <template #footer><MvButton size="sm">Open</MvButton></template>
      </MvSidePanel>`,
    }),
};

export const Toggleable: Story = {
    render: () => ({
        components: { MvSidePanel, MvButton },
        setup: () => ({ open: ref(false) }),
        template: `
      <div>
        <MvButton @click="open = true">Open panel</MvButton>
        <MvSidePanel v-if="open" title="Order 1001" @close="open = false">
          <p>Key data goes here.</p>
        </MvSidePanel>
      </div>`,
    }),
};
