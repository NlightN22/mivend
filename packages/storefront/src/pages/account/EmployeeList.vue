<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { formatDate } from '../../i18n/format';
import type { Employee } from './employeesDemo';

defineProps<{ employees: Employee[] }>();

const { t } = useI18n();

const STATUS_ACTIVITY_LABEL = {
    active: 'employees.lastLogin',
    invited: 'employees.inviteExpires',
    disabled: 'employees.disabledAt',
} as const;

function contactLine(emp: Employee): string {
    const parts = [emp.email, emp.phone, emp.contactNote && t(`employees.${emp.contactNote}`)];
    return parts.filter(Boolean).join(' · ');
}

function activityText(emp: Employee): string {
    const a = emp.activity;
    if ('time' in a) return t(`employees.${a.kind}`, { time: a.time });
    const date = formatDate(a.date, { day: '2-digit', month: '2-digit', year: 'numeric' });
    return a.kind === 'until' ? t('employees.until', { date }) : date;
}
</script>

<template>
    <div class="emp-list">
        <div
            v-for="emp in employees"
            :key="emp.id"
            class="emp-row"
            :class="{
                'emp-row--disabled': emp.status === 'disabled',
                'emp-row--invited': emp.status === 'invited',
            }"
        >
            <div class="emp-avatar">{{ emp.initials }}</div>

            <div class="emp-row__info">
                <div class="emp-row__name">{{ emp.name }}</div>
                <div class="emp-row__contact">{{ contactLine(emp) }}</div>
                <div v-if="emp.permissions.length" class="emp-row__perms">
                    <span v-for="p in emp.permissions" :key="p" class="emp-perm">{{
                        $t(`employees.permission.${p}`)
                    }}</span>
                </div>
            </div>

            <div class="emp-cell">
                <div class="emp-cell__label">{{ $t('employees.roleLabel') }}</div>
                <div class="emp-cell__value">{{ $t(`employees.role.${emp.role}.title`) }}</div>
            </div>

            <div class="emp-cell">
                <div class="emp-cell__label">{{ $t('employees.tradingPoints') }}</div>
                <div class="emp-cell__value">
                    {{ emp.points ? emp.points.join(' · ') : $t('employees.allPointsShort') }}
                </div>
            </div>

            <div class="emp-cell">
                <div class="emp-cell__label">{{ $t(STATUS_ACTIVITY_LABEL[emp.status]) }}</div>
                <div class="emp-cell__value">{{ activityText(emp) }}</div>
            </div>

            <span
                class="emp-pill"
                :class="{
                    'emp-pill--warning': emp.status === 'invited',
                    'emp-pill--muted': emp.status === 'disabled',
                }"
                >{{ $t(`employees.filter.${emp.status}`) }}</span
            >

            <div class="emp-row__actions">
                <template v-if="emp.status === 'active'">
                    <button class="emp-btn emp-btn--sm">{{ $t('employees.action.edit') }}</button>
                    <button class="emp-btn emp-btn--sm emp-btn--danger">
                        {{ $t('employees.action.disable') }}
                    </button>
                </template>
                <template v-else-if="emp.status === 'invited'">
                    <button class="emp-btn emp-btn--sm">{{ $t('employees.action.resend') }}</button>
                    <button class="emp-btn emp-btn--sm emp-btn--danger">
                        {{ $t('employees.action.cancel') }}
                    </button>
                </template>
                <button v-else class="emp-btn emp-btn--sm">
                    {{ $t('employees.action.restore') }}
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped src="./EmployeeButtons.css"></style>
<style scoped>
.emp-list {
    display: grid;
    gap: 8px;
}

.emp-row {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 140px 180px 110px auto auto;
    gap: 12px;
    align-items: center;
    background: #fff;
    border: 1px solid #dde7e2;
    border-radius: 18px;
    padding: 14px 16px;
    transition: border-color 0.14s;
}
.emp-row:hover {
    border-color: #b8d8cc;
}
.emp-row--disabled {
    opacity: 0.6;
    background: #f9fbfa;
}
.emp-row--invited {
    border-color: #ffd88a;
    background: #fffcf5;
}

.emp-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: linear-gradient(145deg, #e2f8ef, #f4fbff);
    color: #008a64;
    display: grid;
    place-items: center;
    font-size: 14px;
    font-weight: 950;
    flex-shrink: 0;
}

.emp-row__info {
    min-width: 0;
}
.emp-row__name {
    font-size: 15px;
    font-weight: 900;
    color: #14231f;
    margin-bottom: 2px;
    letter-spacing: -0.02em;
}
.emp-row__contact {
    font-size: 12px;
    color: #66736e;
    margin-bottom: 5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.emp-row__perms {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}
.emp-perm {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    background: #eef4f1;
    color: #66736e;
}

.emp-cell__label {
    font-size: 11px;
    font-weight: 800;
    color: #a8b8b2;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 3px;
}
.emp-cell__value {
    font-size: 13px;
    font-weight: 800;
    color: #263732;
    line-height: 1.3;
}

.emp-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
    background: #e2f8ef;
    color: #008a64;
}
.emp-pill--warning {
    background: #fff5df;
    color: #a05500;
}
.emp-pill--muted {
    background: #f0f2f1;
    color: #8a9e98;
}

.emp-row__actions {
    display: flex;
    gap: 6px;
}

@media (max-width: 1200px) {
    .emp-row {
        grid-template-columns: 44px minmax(0, 1fr) 130px 150px auto auto;
    }
    .emp-cell:nth-child(5) {
        display: none;
    }
}

@media (max-width: 960px) {
    .emp-row {
        grid-template-columns: 44px minmax(0, 1fr) auto auto;
    }
    .emp-cell {
        display: none;
    }
}

@media (max-width: 640px) {
    .emp-row {
        grid-template-columns: 44px minmax(0, 1fr) auto;
    }
    .emp-row__actions {
        flex-direction: column;
    }
}
</style>
