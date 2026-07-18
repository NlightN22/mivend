import type { Meta, StoryObj } from '@storybook/vue3';
import MvFilterBar from './MvFilterBar.vue';
import MvFormField from '../MvFormField/MvFormField.vue';
import MvInput from '../MvInput/MvInput.vue';
import MvSelect from '../MvSelect/MvSelect.vue';

const meta: Meta<typeof MvFilterBar> = {
    title: 'Molecules/MvFilterBar',
    component: MvFilterBar,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof MvFilterBar>;

export const Default: Story = {
    render: () => ({
        components: { MvFilterBar, MvFormField, MvInput, MvSelect },
        template: `
      <MvFilterBar @reset="() => {}">
        <MvFormField label="Search">
          <MvInput model-value="" placeholder="Order number" />
        </MvFormField>
        <MvFormField label="Status">
          <MvSelect model-value="pending" :options="[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }]" />
        </MvFormField>
        <MvFormField label="Branch">
          <MvSelect model-value="branch-a" :options="[{ value: 'branch-a', label: 'branch-a' }, { value: 'branch-b', label: 'branch-b' }]" />
        </MvFormField>
      </MvFilterBar>
    `,
    }),
};
