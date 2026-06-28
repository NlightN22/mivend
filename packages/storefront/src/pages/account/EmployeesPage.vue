<script setup lang="ts">
import { ref, computed } from 'vue';
import AccountSidebar from './AccountSidebar.vue';

interface Employee {
    id: string;
    initials: string;
    name: string;
    contact: string;
    role: string;
    points: string;
    status: 'active' | 'invited' | 'disabled';
    statusLabel: string;
    lastActivity: string;
    lastActivityLabel: string;
    permissions: string[];
}

const roles = [
    { title: 'Customer Admin', note: 'Employees, trading points, orders, documents and payments.' },
    { title: 'Purchaser', note: 'Catalog, cart, placing orders and favorites.' },
    { title: 'Accountant', note: 'Documents, balance, limits and payments.' },
    { title: 'Observer', note: 'View-only access to orders, documents and stock.' },
];

const tradingPoints = ['Main service point', 'North depot', 'Warehouse B'];

const employees: Employee[] = [
    {
        id: '1',
        initials: 'IP',
        name: 'Ivan Petrov',
        contact: 'ivan.petrov@example.com · +7 913 100 0001 · primary contact',
        role: 'Customer Admin',
        points: 'All points',
        status: 'active',
        statusLabel: 'Active',
        lastActivity: 'Today 13:48',
        lastActivityLabel: 'Last login',
        permissions: ['Orders', 'Payments', 'Documents', 'Employees'],
    },
    {
        id: '2',
        initials: 'AS',
        name: 'Alexey Smirnov',
        contact: 'alexey.smirnov@example.com · +7 913 200 0002',
        role: 'Purchaser',
        points: 'Main service point · North depot',
        status: 'active',
        statusLabel: 'Active',
        lastActivity: 'Yesterday 18:22',
        lastActivityLabel: 'Last login',
        permissions: ['Catalog', 'Orders', 'Favorites'],
    },
    {
        id: '3',
        initials: 'EM',
        name: 'Elena Morozova',
        contact: 'elena.morozova@example.com · +7 913 300 0003',
        role: 'Accountant',
        points: 'All points',
        status: 'active',
        statusLabel: 'Active',
        lastActivity: '24.06.2026',
        lastActivityLabel: 'Last login',
        permissions: ['Documents', 'Balance', 'Payments'],
    },
    {
        id: '4',
        initials: 'KN',
        name: 'Kirill Nikitin',
        contact: 'kirill.nikitin@example.com · invitation sent',
        role: 'Observer',
        points: 'Main service point',
        status: 'invited',
        statusLabel: 'Invited',
        lastActivity: 'until 30.06.2026',
        lastActivityLabel: 'Invite expires',
        permissions: ['View orders', 'View documents'],
    },
    {
        id: '5',
        initials: 'SI',
        name: 'Sergey Ivanov',
        contact: 'sergey.ivanov@example.com · access disabled',
        role: 'Purchaser',
        points: 'Warehouse B',
        status: 'disabled',
        statusLabel: 'Disabled',
        lastActivity: '20.06.2026',
        lastActivityLabel: 'Disabled',
        permissions: [],
    },
];

type Filter = 'all' | 'active' | 'invited' | 'disabled';
const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: 5 },
    { key: 'active', label: 'Active', count: 3 },
    { key: 'invited', label: 'Invited', count: 1 },
    { key: 'disabled', label: 'Disabled', count: 1 },
];

const activeFilter = ref<Filter>('all');
const addOpen = ref(false);
const showRolesHelp = ref(false);
const addForm = ref({ name: '', contact: '', role: '', allPoints: false, points: [] as string[] });

const filtered = computed(() =>
    activeFilter.value === 'all' ? employees : employees.filter(e => e.status === activeFilter.value),
);

function openAdd(): void {
    addForm.value = { name: '', contact: '', role: '', allPoints: false, points: [] };
    addOpen.value = true;
}
</script>

<template>
  <div class="emp-page">
    <AccountSidebar />

    <section class="emp-content">
      <div class="emp-head">
        <div class="emp-head__left">
          <h1 class="emp-title">Employees</h1>
          <button
            class="emp-roles-btn"
            :class="{ 'emp-roles-btn--active': showRolesHelp }"
            @click="showRolesHelp = !showRolesHelp"
          >? Roles</button>
        </div>
        <div class="emp-head__right">
          <button class="emp-btn">Login history</button>
          <button class="emp-btn emp-btn--primary" @click="openAdd">+ Invite employee</button>
        </div>
      </div>

      <!-- Roles help -->
      <div v-if="showRolesHelp" class="emp-roles-help">
        <div class="emp-roles-help__head">
          <strong>Roles — fixed set, no permission constructor</strong>
          <button class="emp-roles-help__close" @click="showRolesHelp = false">×</button>
        </div>
        <div class="emp-roles-help__grid">
          <div v-for="r in roles" :key="r.title" class="emp-role-item">
            <div class="emp-role-item__title">{{ r.title }}</div>
            <div class="emp-role-item__note">{{ r.note }}</div>
          </div>
        </div>
      </div>

      <!-- Invite form -->
      <div v-if="addOpen" class="emp-invite-card">
        <div class="emp-invite-card__title">Invite employee</div>
        <div class="emp-invite-form">
          <label class="emp-field">
            <span>Full name</span>
            <input v-model="addForm.name" placeholder="e.g. Anna Sorokina" />
          </label>
          <label class="emp-field">
            <span>Email or phone</span>
            <input v-model="addForm.contact" placeholder="email@example.com" />
          </label>
          <label class="emp-field">
            <span>Role</span>
            <select v-model="addForm.role">
              <option value="" disabled>Select role</option>
              <option v-for="r in roles" :key="r.title" :value="r.title">{{ r.title }}</option>
            </select>
          </label>
          <div class="emp-field emp-field--points">
            <span>Trading points</span>
            <div class="emp-check-list">
              <label class="emp-check-row">
                <input v-model="addForm.allPoints" type="checkbox" />
                All current and future points
              </label>
              <template v-if="!addForm.allPoints">
                <label v-for="pt in tradingPoints" :key="pt" class="emp-check-row">
                  <input v-model="addForm.points" type="checkbox" :value="pt" />
                  {{ pt }}
                </label>
              </template>
            </div>
          </div>
        </div>
        <div class="emp-invite-card__actions">
          <button
            class="emp-btn emp-btn--primary"
            :disabled="!addForm.name || !addForm.contact || !addForm.role"
          >Send invitation</button>
          <button class="emp-btn" @click="addOpen = false">Cancel</button>
        </div>
      </div>

      <!-- Filters -->
      <div class="emp-filters">
        <button
          v-for="f in filters"
          :key="f.key"
          class="emp-chip"
          :class="{ 'emp-chip--active': activeFilter === f.key }"
          @click="activeFilter = f.key"
        >{{ f.label }}<span class="emp-chip__count">{{ f.count }}</span></button>
      </div>

      <!-- Notice -->
      <div class="emp-notice">
        <span>ℹ️</span>
        <div>
          <strong>No complex permission matrix.</strong>
          Customer selects a role and trading points. Sufficient for the base B2B model.
        </div>
      </div>

      <!-- List -->
      <div class="emp-list">
        <div
          v-for="emp in filtered"
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
            <div class="emp-row__contact">{{ emp.contact }}</div>
            <div v-if="emp.permissions.length" class="emp-row__perms">
              <span v-for="p in emp.permissions" :key="p" class="emp-perm">{{ p }}</span>
            </div>
          </div>

          <div class="emp-cell">
            <div class="emp-cell__label">Role</div>
            <div class="emp-cell__value">{{ emp.role }}</div>
          </div>

          <div class="emp-cell">
            <div class="emp-cell__label">Trading points</div>
            <div class="emp-cell__value">{{ emp.points }}</div>
          </div>

          <div class="emp-cell">
            <div class="emp-cell__label">{{ emp.lastActivityLabel }}</div>
            <div class="emp-cell__value">{{ emp.lastActivity }}</div>
          </div>

          <span
            class="emp-pill"
            :class="{
              'emp-pill--warning': emp.status === 'invited',
              'emp-pill--muted': emp.status === 'disabled',
            }"
          >{{ emp.statusLabel }}</span>

          <div class="emp-row__actions">
            <template v-if="emp.status === 'active'">
              <button class="emp-btn emp-btn--sm">Edit</button>
              <button class="emp-btn emp-btn--sm emp-btn--danger">Disable</button>
            </template>
            <template v-else-if="emp.status === 'invited'">
              <button class="emp-btn emp-btn--sm">Resend</button>
              <button class="emp-btn emp-btn--sm emp-btn--danger">Cancel</button>
            </template>
            <template v-else>
              <button class="emp-btn emp-btn--sm">Restore</button>
            </template>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.emp-page {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 28px 56px;
}

.emp-content { min-width: 0; display: grid; gap: 16px; }

.emp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.emp-head__left { display: flex; align-items: center; gap: 12px; }

.emp-title {
  margin: 0;
  font-size: clamp(34px, 3.6vw, 50px);
  line-height: 0.98;
  letter-spacing: -0.055em;
}

.emp-roles-btn {
  border: 1px solid #dde7e2;
  border-radius: 10px;
  padding: 0 12px;
  min-height: 32px;
  background: #f3f8f6;
  color: #66736e;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  transition: 0.14s ease;
}
.emp-roles-btn--active { background: #e2f8ef; border-color: #00a878; color: #008a64; }

.emp-head__right { display: flex; gap: 8px; flex-shrink: 0; }

.emp-btn {
  border: 1px solid #dde7e2;
  border-radius: 12px;
  padding: 0 14px;
  min-height: 38px;
  font: inherit;
  font-weight: 800;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  background: #f3f8f6;
  color: #263732;
  transition: 0.14s ease;
}
.emp-btn--primary { background: #00a878; color: #fff; border-color: transparent; }
.emp-btn--danger { background: #fff2f1; color: #b42318; border-color: #fdd; }
.emp-btn--sm { min-height: 32px; padding: 0 10px; border-radius: 10px; font-size: 12px; }
.emp-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Roles help */
.emp-roles-help {
  background: #fff;
  border: 1px solid #dde7e2;
  border-radius: 20px;
  padding: 18px 20px;
}

.emp-roles-help__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  font-size: 14px;
  color: #14231f;
}

.emp-roles-help__close {
  border: 0;
  background: none;
  font-size: 18px;
  color: #a8b8b2;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}

.emp-roles-help__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.emp-role-item {
  background: #f7fbf9;
  border: 1px solid #edf2ef;
  border-radius: 14px;
  padding: 12px 14px;
}
.emp-role-item__title { font-size: 13px; font-weight: 900; color: #14231f; margin-bottom: 4px; }
.emp-role-item__note { font-size: 12px; color: #66736e; line-height: 1.4; }

/* Invite form */
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

.emp-field--points { grid-column: 1 / -1; }

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
.emp-field select:focus { border-color: #00a878; box-shadow: 0 0 0 3px rgba(0,168,120,0.1); }

.emp-check-list { display: flex; flex-wrap: wrap; gap: 8px; }
.emp-check-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #263732;
  cursor: pointer;
}

.emp-invite-card__actions { display: flex; gap: 8px; }

/* Filters */
.emp-filters { display: flex; flex-wrap: wrap; gap: 8px; }

.emp-chip {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid #dde7e2;
  background: #fff;
  color: #344640;
  font: inherit;
  font-weight: 850;
  font-size: 13px;
  cursor: pointer;
  transition: 0.14s ease;
}
.emp-chip--active { background: #00a878; border-color: #00a878; color: #fff; }
.emp-chip--active .emp-chip__count { background: rgba(255,255,255,0.25); color: #fff; }

.emp-chip__count {
  min-width: 20px;
  height: 20px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #eef4f1;
  color: #66736e;
  font-size: 11px;
  font-weight: 900;
}

/* Notice */
.emp-notice {
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(255,138,0,0.22);
  background: #fff5df;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  color: #573a14;
  font-size: 13px;
  line-height: 1.42;
}
.emp-notice strong { display: block; color: #33210a; margin-bottom: 2px; }

/* Employee list */
.emp-list { display: grid; gap: 8px; }

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
.emp-row:hover { border-color: #b8d8cc; }
.emp-row--disabled { opacity: 0.6; background: #f9fbfa; }
.emp-row--invited { border-color: #ffd88a; background: #fffcf5; }

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

.emp-row__info { min-width: 0; }
.emp-row__name { font-size: 15px; font-weight: 900; color: #14231f; margin-bottom: 2px; letter-spacing: -0.02em; }
.emp-row__contact { font-size: 12px; color: #66736e; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.emp-row__perms { display: flex; flex-wrap: wrap; gap: 4px; }
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

.emp-cell__label { font-size: 11px; font-weight: 800; color: #a8b8b2; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 3px; }
.emp-cell__value { font-size: 13px; font-weight: 800; color: #263732; line-height: 1.3; }

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
.emp-pill--warning { background: #fff5df; color: #a05500; }
.emp-pill--muted { background: #f0f2f1; color: #8a9e98; }

.emp-row__actions { display: flex; gap: 6px; }

@media (max-width: 1200px) {
  .emp-row { grid-template-columns: 44px minmax(0,1fr) 130px 150px auto auto; }
  .emp-cell:nth-child(5) { display: none; }
}

@media (max-width: 960px) {
  .emp-page { grid-template-columns: 1fr; padding-left: 16px; padding-right: 16px; }
  .emp-roles-help__grid { grid-template-columns: 1fr 1fr; }
  .emp-row { grid-template-columns: 44px minmax(0,1fr) auto auto; }
  .emp-cell { display: none; }
  .emp-invite-form { grid-template-columns: 1fr 1fr; }
  .emp-field--points { grid-column: auto; }
}

@media (max-width: 640px) {
  .emp-head { flex-direction: column; align-items: flex-start; }
  .emp-roles-help__grid { grid-template-columns: 1fr; }
  .emp-row { grid-template-columns: 44px minmax(0,1fr) auto; }
  .emp-row__actions { flex-direction: column; }
  .emp-invite-form { grid-template-columns: 1fr; }
}
</style>
