import type { Meta, StoryObj } from '@storybook/vue3';
import MvPopover from './MvPopover.vue';
import MvButton from '../MvButton/MvButton.vue';

const meta: Meta<typeof MvPopover> = {
    title: 'Molecules/MvPopover',
    component: MvPopover,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof MvPopover>;

export const Default: Story = {
    render: args => ({
        components: { MvPopover, MvButton },
        setup: () => ({ args }),
        template: `
      <MvPopover v-bind="args">
        <template #trigger><MvButton>Confirm order</MvButton></template>
        Reserve stock for this order and confirm it.
      </MvPopover>
    `,
    }),
};
