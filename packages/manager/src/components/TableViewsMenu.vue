<script setup lang="ts">
import { onMounted } from 'vue';
import { MvTableViews } from '@mivend/ui-kit';
import { useAuthStore } from '../stores/auth';
import { useTableViews } from '../composables/useTableViews';
import type { TableViewState } from '../composables/tableViewState';

// The Views control for any manager list: pass a unique `viewsKey` and the table's capture/apply pair.
const props = defineProps<{
    viewsKey: string;
    ownerKey: string;
    capture: () => TableViewState;
    apply: (state: TableViewState) => void;
    skipRestore?: () => boolean;
}>();

const canManageShared = useAuthStore().hasPermission('ManageSharedTableViews');

const views = useTableViews({
    viewsKey: props.viewsKey,
    ownerKey: props.ownerKey,
    capture: props.capture,
    apply: props.apply,
    skipRestore: props.skipRestore,
});

onMounted(() => void views.init());
</script>

<template>
    <MvTableViews
        :views="
            views.views.value.map(v => ({
                id: v.id,
                name: v.name,
                shared: v.shared,
                isDefault: v.isDefault,
            }))
        "
        :can-manage-shared="canManageShared"
        :active-id="views.activeId.value"
        :dirty="views.dirty.value"
        :busy="views.busy.value"
        @select="views.select"
        @reset="views.reset"
        @create="views.create"
        @update="views.update"
        @rename="views.rename"
        @duplicate="views.duplicate"
        @delete="views.remove"
        @set-default="views.setDefault"
    />
</template>
