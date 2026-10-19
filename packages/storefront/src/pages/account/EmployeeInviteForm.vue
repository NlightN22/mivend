<script setup lang="ts">
import { ref } from 'vue';
import { DEMO_TRADING_POINTS, ROLES } from './employeesDemo';

const emit = defineEmits<{ cancel: [] }>();
const form = ref({ name: '', contact: '', role: '', allPoints: false, points: [] as string[] });
</script>

<template>
    <div class="emp-invite-card">
        <div class="emp-invite-card__title">{{ $t('employees.inviteTitle') }}</div>
        <div class="emp-invite-form">
            <label class="emp-field">
                <span>{{ $t('employees.fullName') }}</span>
                <input v-model="form.name" :placeholder="$t('employees.fullNamePlaceholder')" />
            </label>
            <label class="emp-field">
                <span>{{ $t('employees.contact') }}</span>
                <input v-model="form.contact" :placeholder="$t('employees.contactPlaceholder')" />
            </label>
            <label class="emp-field">
                <span>{{ $t('employees.roleLabel') }}</span>
                <select v-model="form.role">
                    <option value="" disabled>{{ $t('employees.selectRole') }}</option>
                    <option v-for="r in ROLES" :key="r" :value="r">
                        {{ $t(`employees.role.${r}.title`) }}
                    </option>
                </select>
            </label>
            <div class="emp-field emp-field--points">
                <span>{{ $t('employees.tradingPoints') }}</span>
                <div class="emp-check-list">
                    <label class="emp-check-row">
                        <input v-model="form.allPoints" type="checkbox" />
                        {{ $t('employees.allPoints') }}
                    </label>
                    <template v-if="!form.allPoints">
                        <label v-for="pt in DEMO_TRADING_POINTS" :key="pt" class="emp-check-row">
                            <input v-model="form.points" type="checkbox" :value="pt" />
                            {{ pt }}
                        </label>
                    </template>
                </div>
            </div>
        </div>
        <div class="emp-invite-card__actions">
            <button
                class="emp-btn emp-btn--primary"
                :disabled="!form.name || !form.contact || !form.role"
            >
                {{ $t('employees.sendInvite') }}
            </button>
            <button class="emp-btn" @click="emit('cancel')">{{ $t('employees.cancel') }}</button>
        </div>
    </div>
</template>

<style scoped src="./EmployeeButtons.css"></style>
<style scoped>
.emp-invite-card {
    background: #fff;
    border: 1px solid #00a878;
    border-radius: 20px;
    padding: 18px 20px;
}

.emp-invite-card__title {
    font-size: 16px;
    font-weight: 900;
    letter-spacing: -0.03em;
    margin-bottom: 14px;
}

.emp-invite-form {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    margin-bottom: 14px;
}

.emp-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 13px;
    font-weight: 700;
    color: #66736e;
}

.emp-field--points {
    grid-column: 1 / -1;
}

.emp-field input,
.emp-field select {
    border: 1px solid #dde7e2;
    border-radius: 12px;
    padding: 9px 12px;
    font: inherit;
    font-size: 14px;
    outline: none;
    background: #fff;
}
.emp-field input:focus,
.emp-field select:focus {
    border-color: #00a878;
    box-shadow: 0 0 0 3px rgba(0, 168, 120, 0.1);
}

.emp-check-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
.emp-check-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    color: #263732;
    cursor: pointer;
}

.emp-invite-card__actions {
    display: flex;
    gap: 8px;
}

/* Filters */

@media (max-width: 960px) {
    .emp-invite-form {
        grid-template-columns: 1fr 1fr;
    }
    .emp-field--points {
        grid-column: auto;
    }
}

@media (max-width: 640px) {
    .emp-invite-form {
        grid-template-columns: 1fr;
    }
}
</style>
