<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvButton, MvDateTimeCell, MvModal, MvNotice, MvSelect } from '@mivend/ui-kit';
import {
    CONTRACT_FILE_KINDS,
    deleteContractFile,
    uploadContractFile,
    type ContractRow,
} from '../../api/contractFiles';

const props = defineProps<{ contract: ContractRow; canManage: boolean }>();
const emit = defineEmits<{ close: []; changed: [] }>();
const { t } = useI18n();

const kind = ref<string>('scan');
const file = ref<File | null>(null);
const busy = ref(false);
const error = ref('');

const kindOptions = computed(() =>
    CONTRACT_FILE_KINDS.map(value => ({ value, label: t(`customers.contracts.kinds.${value}`) })),
);

function pick(event: Event): void {
    file.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}

async function run(work: () => Promise<void>): Promise<void> {
    busy.value = true;
    error.value = '';
    try {
        await work();
        emit('changed');
    } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
    } finally {
        busy.value = false;
    }
}

function upload(): void {
    const chosen = file.value;
    if (!chosen) return;
    void run(async () => {
        await uploadContractFile(props.contract.id, kind.value, chosen);
        file.value = null;
    });
}
</script>

<template>
    <MvModal :title="contract.name ?? contract.erpId" @close="emit('close')">
        <div class="contract-files">
            <p v-if="!contract.files.length" class="contract-files__empty">
                {{ t('customers.contracts.noFiles') }}
            </p>
            <ul v-else class="contract-files__list">
                <li v-for="f in contract.files" :key="f.uuid" class="contract-files__item">
                    <div class="contract-files__meta">
                        <a :href="f.downloadUrl" class="contract-files__name">{{ f.fileName }}</a>
                        <span class="contract-files__sub">
                            {{ t(`customers.contracts.kinds.${f.kind}`) }}
                            <template v-if="f.uploadedBy"> · {{ f.uploadedBy }}</template>
                            · <MvDateTimeCell :value="f.createdAt as string" />
                        </span>
                    </div>
                    <MvButton
                        v-if="canManage"
                        variant="danger"
                        size="sm"
                        :disabled="busy"
                        @click="run(() => deleteContractFile(f.uuid))"
                    >
                        {{ t('customers.contracts.delete') }}
                    </MvButton>
                </li>
            </ul>

            <div v-if="canManage" class="contract-files__form">
                <MvSelect v-model="kind" :options="kindOptions" :disabled="busy" />
                <input
                    type="file"
                    accept="application/pdf,image/*"
                    :disabled="busy"
                    :aria-label="t('customers.contracts.chooseFile')"
                    @change="pick"
                />
                <p v-if="kind === 'scan' && contract.hasScan" class="contract-files__sub">
                    {{ t('customers.contracts.replaceHint') }}
                </p>
                <MvButton :disabled="!file || busy" @click="upload">
                    {{ t('customers.contracts.upload') }}
                </MvButton>
            </div>
            <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
        </div>
    </MvModal>
</template>

<style scoped>
.contract-files {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.contract-files__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.contract-files__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.contract-files__meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.contract-files__name {
    overflow-wrap: anywhere;
    font-weight: 600;
}

.contract-files__sub,
.contract-files__empty {
    margin: 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
}

.contract-files__form {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
</style>
