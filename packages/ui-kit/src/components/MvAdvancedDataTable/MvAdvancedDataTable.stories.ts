import { ref } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3';
import MvAdvancedDataTable from './MvAdvancedDataTable.vue';
import MvTableSkeletonCards from './MvTableSkeletonCards.vue';

const meta: Meta = {
    title: 'Organisms/MvAdvancedDataTable skeleton',
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

export const DesktopRows: Story = {
    render: () => ({
        components: { MvAdvancedDataTable },
        setup: () => {
            const none = { type: 'none' as const };
            const columns = ['Number', 'Customer', 'Total'].map(header => ({
                field: header.toLowerCase(),
                header,
                width: 180,
                filterConfig: none,
            }));
            const tableState = ref({
                columnOrder: columns.map(c => c.field),
                columnWidths: {},
                hiddenColumns: [],
                sort: [],
                filters: {},
                pageSize: 8,
            });
            return { columns, tableState };
        },
        template:
            '<MvAdvancedDataTable v-model:table-state="tableState" data-key="id" :columns="columns" :rows="[]" loading :total-items="0" :page="1" :row-height-px="48" :header-height-px="44" :default-filters="{}" />',
    }),
};

export const PhoneCards: Story = {
    render: () => ({
        components: { MvTableSkeletonCards },
        template:
            '<div style="max-width:390px;display:grid;gap:12px"><MvTableSkeletonCards :rows="3" :fields="4" badge /></div>',
    }),
};
