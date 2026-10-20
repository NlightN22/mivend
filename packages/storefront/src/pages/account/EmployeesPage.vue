<script setup lang="ts">
import { MvNotImplemented } from '@mivend/ui-kit';
import { useDemoMode } from '../../composables/useDemoMode';
import { ref, computed, toRef } from 'vue';
import type { Ref } from 'vue';
import { useUrlState } from '@mivend/ui-kit';
import AccountSidebar from './AccountSidebar.vue';
import EmployeeInviteForm from './EmployeeInviteForm.vue';
import EmployeeList from './EmployeeList.vue';
import { DEMO_EMPLOYEES, ROLES, type EmployeeStatus } from './employeesDemo';

type Filter = 'all' | EmployeeStatus;
const FILTERS: Filter[] = ['all', 'active', 'invited', 'disabled'];

const { filters: urlState } = useUrlState({ status: 'all' });
const activeFilter = toRef(urlState, 'status') as unknown as Ref<Filter>;
const addOpen = ref(false);
const showRolesHelp = ref(false);

const countOf = (f: Filter): number =>
    f === 'all' ? DEMO_EMPLOYEES.length : DEMO_EMPLOYEES.filter(e => e.status === f).length;

const filtered = computed(() =>
    activeFilter.value === 'all'
        ? DEMO_EMPLOYEES
        : DEMO_EMPLOYEES.filter(e => e.status === activeFilter.value),
);
const { demoAllowed } = useDemoMode();
</script>

<template>
    <div class="emp-page">
        <AccountSidebar />

        <section v-if="!demoAllowed" class="emp-content">
            <h1 class="emp-title emp-title--stub">{{ $t('employees.title') }}</h1>
            <MvNotImplemented
                :title="$t('common.notImplemented.title')"
                :message="$t('common.notImplemented.message')"
            />
        </section>
        <section v-else class="emp-content">
            <div class="emp-head">
                <div class="emp-head__left">
                    <h1 class="emp-title">{{ $t('employees.title') }}</h1>
                    <button
                        class="emp-roles-btn"
                        :class="{ 'emp-roles-btn--active': showRolesHelp }"
                        @click="showRolesHelp = !showRolesHelp"
                    >
                        {{ $t('employees.roles') }}
                    </button>
                </div>
                <div class="emp-head__right">
                    <button class="emp-btn">{{ $t('employees.loginHistory') }}</button>
                    <button class="emp-btn emp-btn--primary" @click="addOpen = true">
                        {{ $t('employees.invite') }}
                    </button>
                </div>
            </div>

            <div v-if="showRolesHelp" class="emp-roles-help">
                <div class="emp-roles-help__head">
                    <strong>{{ $t('employees.rolesTitle') }}</strong>
                    <button
                        class="emp-roles-help__close"
                        :aria-label="$t('employees.close')"
                        @click="showRolesHelp = false"
                    >
                        ×
                    </button>
                </div>
                <div class="emp-roles-help__grid">
                    <div v-for="r in ROLES" :key="r" class="emp-role-item">
                        <div class="emp-role-item__title">
                            {{ $t(`employees.role.${r}.title`) }}
                        </div>
                        <div class="emp-role-item__note">{{ $t(`employees.role.${r}.note`) }}</div>
                    </div>
                </div>
            </div>

            <EmployeeInviteForm v-if="addOpen" @cancel="addOpen = false" />

            <div class="emp-filters">
                <button
                    v-for="f in FILTERS"
                    :key="f"
                    class="emp-chip"
                    :class="{ 'emp-chip--active': activeFilter === f }"
                    @click="activeFilter = f"
                >
                    {{ $t(`employees.filter.${f}`)
                    }}<span class="emp-chip__count">{{ countOf(f) }}</span>
                </button>
            </div>

            <div class="emp-notice">
                <span>ℹ️</span>
                <div>
                    <strong>{{ $t('employees.noticeTitle') }}</strong>
                    {{ $t('employees.noticeText') }}
                </div>
            </div>

            <EmployeeList :employees="filtered" />
        </section>
    </div>
</template>

<style scoped src="./EmployeeButtons.css"></style>
<style scoped src="./EmployeesPage.css"></style>
