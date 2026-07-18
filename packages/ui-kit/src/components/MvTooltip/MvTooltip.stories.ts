import type { Meta, StoryObj } from '@storybook/vue3';
import MvTooltip from './MvTooltip.vue';
import MvIconButton from '../MvIconButton/MvIconButton.vue';

const meta: Meta<typeof MvTooltip> = {
    title: 'Atoms/MvTooltip',
    component: MvTooltip,
    tags: ['autodocs'],
    argTypes: {
        placement: { control: 'select', options: ['top', 'bottom', 'left', 'right'] },
    },
    args: { placement: 'bottom' },
};

export default meta;
type Story = StoryObj<typeof MvTooltip>;

export const Default: Story = {
    render: args => ({
        components: { MvTooltip, MvIconButton },
        setup: () => ({ args }),
        template: `
      <MvTooltip v-bind="args">
        <template #trigger><MvIconButton label="Info">ⓘ</MvIconButton></template>
        Prices shown include VAT for branch-a.
      </MvTooltip>
    `,
    }),
};
