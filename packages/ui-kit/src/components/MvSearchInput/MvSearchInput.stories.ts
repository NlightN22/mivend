import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import MvSearchInput from './MvSearchInput.vue';
import type { SuggestionGroup } from './MvSearchInput.vue';

const SAMPLE_SUGGESTIONS: SuggestionGroup[] = [
    {
        type: 'products',
        label: 'Products',
        items: [
            { id: 'p1', label: 'Oil filter OC90', subtitle: 'Mahle' },
            { id: 'p2', label: 'Oil filter W 610/3', subtitle: 'Mann' },
        ],
    },
    {
        type: 'brands',
        label: 'Brands',
        items: [
            { id: 'b1', label: 'Bosch' },
            { id: 'b2', label: 'Mahle' },
        ],
    },
    {
        type: 'oem',
        label: 'OEM Numbers',
        items: [{ id: 'o1', label: '0986494063', subtitle: 'Brake pads' }],
    },
    {
        type: 'vin',
        label: 'VIN Results',
        items: [{ id: 'v1', label: 'WVWZZZ3BZ3E123456', subtitle: 'VW Golf IV 2003' }],
    },
    {
        type: 'analogs',
        label: 'Analogs',
        items: [{ id: 'a1', label: 'OC90 → W 610/3', subtitle: 'Mann — compatible' }],
    },
    {
        type: 'previous',
        label: 'Recent searches',
        items: [
            { id: 'r1', label: 'brake pads bosch' },
            { id: 'r2', label: 'oil filter mahle' },
        ],
    },
];

const meta: Meta<typeof MvSearchInput> = {
    title: 'Components/MvSearchInput',
    component: MvSearchInput,
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof MvSearchInput>;

export const Default: Story = {
    render: () => ({
        components: { MvSearchInput },
        setup() {
            const value = ref('');
            return { value };
        },
        template: `
      <div style="padding: 24px; max-width: 640px;">
        <MvSearchInput v-model="value" />
      </div>
    `,
    }),
};

export const Focus: Story = {
    render: () => ({
        components: { MvSearchInput },
        setup() {
            const value = ref('oil filter');
            return { value };
        },
        template: `
      <div style="padding: 24px; max-width: 640px;">
        <p style="font-size:12px;color:#667085;margin-bottom:8px;">Click the input to see focus state</p>
        <MvSearchInput v-model="value" />
      </div>
    `,
    }),
};

export const Loading: Story = {
    render: () => ({
        components: { MvSearchInput },
        setup() {
            const value = ref('OC90');
            return { value };
        },
        template: `
      <div style="padding: 24px; max-width: 640px;">
        <MvSearchInput v-model="value" :loading="true" />
      </div>
    `,
    }),
};

export const WithSuggestions: Story = {
    render: () => ({
        components: { MvSearchInput },
        setup() {
            const value = ref('oil');
            const open = ref(true);
            const suggestions = SAMPLE_SUGGESTIONS;
            function onSearch(v: string) {
                value.value = v;
                open.value = false;
            }
            return { value, suggestions, onSearch, open };
        },
        template: `
      <div style="padding: 24px; max-width: 640px; padding-bottom: 320px;">
        <p style="font-size:12px;color:#667085;margin-bottom:8px;">All 6 suggestion groups rendered below the input</p>
        <MvSearchInput
          v-model="value"
          :suggestions="suggestions"
          @search="onSearch"
        />
      </div>
    `,
    }),
};

export const EmptyResult: Story = {
    render: () => ({
        components: { MvSearchInput },
        setup() {
            const value = ref('xyzunknown123');
            const suggestions: SuggestionGroup[] = [];
            return { value, suggestions };
        },
        template: `
      <div style="padding: 24px; max-width: 640px; padding-bottom: 120px;">
        <MvSearchInput v-model="value" :suggestions="suggestions" />
      </div>
    `,
    }),
};

export const ErrorState: Story = {
    render: () => ({
        components: { MvSearchInput },
        setup() {
            const value = ref('');
            return { value };
        },
        template: `
      <div style="padding: 24px; max-width: 640px;">
        <MvSearchInput v-model="value" error="Search service is unavailable. Please try again." />
      </div>
    `,
    }),
};

export const Disabled: Story = {
    render: () => ({
        components: { MvSearchInput },
        setup() {
            const value = ref('');
            return { value };
        },
        template: `
      <div style="padding: 24px; max-width: 640px;">
        <MvSearchInput v-model="value" :disabled="true" placeholder="Search unavailable" />
      </div>
    `,
    }),
};

export const MobileCollapsed: Story = {
    render: () => ({
        components: { MvSearchInput },
        setup() {
            const value = ref('');
            return { value };
        },
        template: `
      <div style="padding: 24px;">
        <p style="font-size:12px;color:#667085;margin-bottom:8px;">Collapsed state — click icon to expand</p>
        <MvSearchInput v-model="value" :collapsed="true" />
      </div>
    `,
    }),
};
