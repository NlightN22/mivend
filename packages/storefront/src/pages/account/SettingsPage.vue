<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { endAllSessions, endSession, fetchMySessions, type SessionSummary } from '../../api/sessions';
import AccountSidebar from './AccountSidebar.vue';

const authStore = useAuthStore();

const sessions = ref<SessionSummary[]>([]);
const sessionsLoading = ref(true);
const sessionsError = ref('');

async function loadSessions() {
    sessionsLoading.value = true;
    sessionsError.value = '';
    try {
        sessions.value = await fetchMySessions();
    } catch (e) {
        sessionsError.value = e instanceof Error ? e.message : 'Could not load sessions';
    } finally {
        sessionsLoading.value = false;
    }
}

onMounted(loadSessions);

async function handleEndSession(id: string) {
    await endSession(id);
    await loadSessions();
}

async function signOutAll() {
    // Ends every session for this user, including the current one — matches
    // this button's own copy ("Sign out everywhere"), so the local logout
    // guard (mv_logged_out) is set the same way a normal logout sets it.
    await endAllSessions();
    await authStore.logout();
    window.location.href = '/login';
}

const profile = ref({
    name: 'Ivan Petrov',
    position: 'Head of Purchasing',
    email: 'ivan.petrov@example.ru',
    phone: '+7 913 000-00-11',
    defaultPoint: 'main',
});
const profileSaving = ref(false);
const profileSaved = ref(false);

async function saveProfile() {
    profileSaving.value = true;
    await new Promise(r => setTimeout(r, 600));
    profileSaving.value = false;
    profileSaved.value = true;
    setTimeout(() => (profileSaved.value = false), 2000);
}

const notifications = ref({
    orderStatus: true,
    documents: true,
    payments: true,
    marketing: false,
});

const catalogView = ref<'grid' | 'list'>('grid');

const showPasswordForm = ref(false);
const passwordForm = ref({ current: '', next: '', confirm: '' });
</script>

<template>
  <div class="set-page">
    <AccountSidebar />

    <section class="set-content">
      <div class="set-head">
        <div>
          <h1 class="set-title">Settings</h1>
          <p class="set-subtitle">Your personal profile, notifications, display preferences and security.</p>
        </div>
      </div>

      <div class="set-notice">
        <span>ℹ️</span>
        <div>
          <strong>These are settings for your account only.</strong>
          Employee management is in the Employees section. Credit limits and contracts are not editable here.
        </div>
      </div>

      <!-- Profile -->
      <div class="set-block">
        <div class="set-block__head">
          <div>
            <h2 class="set-block__title">Profile</h2>
            <div class="set-block__sub">Contact details for notifications, requests and communication with your manager.</div>
          </div>
          <span class="set-pill">Primary contact</span>
        </div>

        <div class="set-form">
          <label class="set-field">
            <span>Full name</span>
            <input v-model="profile.name" />
          </label>
          <label class="set-field">
            <span>Position</span>
            <input v-model="profile.position" />
          </label>
          <label class="set-field">
            <span>Email</span>
            <input v-model="profile.email" type="email" />
          </label>
          <label class="set-field">
            <span>Phone</span>
            <input v-model="profile.phone" type="tel" />
          </label>
          <label class="set-field set-field--wide">
            <span>Default trading point</span>
            <select v-model="profile.defaultPoint">
              <option value="main">Main service point · Industrial St, 14</option>
              <option value="north">North depot · Northern Hwy, 52</option>
              <option value="warehouse">Warehouse B · Warehouse Zone, 8</option>
            </select>
          </label>
        </div>

        <div class="set-block__footer">
          <button class="set-btn set-btn--primary" :disabled="profileSaving" @click="saveProfile">
            {{ profileSaving ? 'Saving…' : profileSaved ? 'Saved ✓' : 'Save profile' }}
          </button>
        </div>
      </div>

      <!-- Notifications -->
      <div class="set-block">
        <div class="set-block__head">
          <div>
            <h2 class="set-block__title">Notifications</h2>
            <div class="set-block__sub">Email, SMS or Telegram — depending on connected channels.</div>
          </div>
        </div>

        <div class="set-toggles">
          <div class="set-toggle-row">
            <div>
              <div class="set-toggle-title">Order status</div>
              <div class="set-toggle-note">Confirmation, reservation, assembly, ready to ship.</div>
            </div>
            <button
              class="set-switch"
              :class="{ 'set-switch--on': notifications.orderStatus }"
              @click="notifications.orderStatus = !notifications.orderStatus"
            />
          </div>
          <div class="set-toggle-row">
            <div>
              <div class="set-toggle-title">Documents</div>
              <div class="set-toggle-note">New invoices, UPD, reconciliation acts and order documents.</div>
            </div>
            <button
              class="set-switch"
              :class="{ 'set-switch--on': notifications.documents }"
              @click="notifications.documents = !notifications.documents"
            />
          </div>
          <div class="set-toggle-row">
            <div>
              <div class="set-toggle-title">Payments &amp; limits</div>
              <div class="set-toggle-note">Upcoming payments, debt, changes to available credit limit.</div>
            </div>
            <button
              class="set-switch"
              :class="{ 'set-switch--on': notifications.payments }"
              @click="notifications.payments = !notifications.payments"
            />
          </div>
          <div class="set-toggle-row">
            <div>
              <div class="set-toggle-title">Marketing</div>
              <div class="set-toggle-note">Promotions, curated selections and special prices.</div>
            </div>
            <button
              class="set-switch"
              :class="{ 'set-switch--on': notifications.marketing }"
              @click="notifications.marketing = !notifications.marketing"
            />
          </div>
        </div>
      </div>

      <!-- Interface -->
      <div class="set-block">
        <div class="set-block__head">
          <div>
            <h2 class="set-block__title">Interface</h2>
            <div class="set-block__sub">Personal preferences for working in the catalog and orders.</div>
          </div>
        </div>

        <div class="set-toggles">
          <div class="set-toggle-row">
            <div>
              <div class="set-toggle-title">Catalog view</div>
              <div class="set-toggle-note">Default layout when browsing the catalog.</div>
            </div>
            <div class="set-segmented">
              <button
                class="set-segmented__btn"
                :class="{ 'set-segmented__btn--active': catalogView === 'grid' }"
                @click="catalogView = 'grid'"
              >▦ Grid</button>
              <button
                class="set-segmented__btn"
                :class="{ 'set-segmented__btn--active': catalogView === 'list' }"
                @click="catalogView = 'list'"
              >☷ List</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Security -->
      <div class="set-block">
        <div class="set-block__head">
          <div>
            <h2 class="set-block__title">Security</h2>
            <div class="set-block__sub">Password and active sessions for your account.</div>
          </div>
          <button class="set-btn" @click="showPasswordForm = !showPasswordForm">
            {{ showPasswordForm ? 'Cancel' : 'Change password' }}
          </button>
        </div>

        <div v-if="showPasswordForm" class="set-form set-form--narrow set-form--password">
          <label class="set-field set-field--wide">
            <span>Current password</span>
            <input v-model="passwordForm.current" type="password" />
          </label>
          <label class="set-field">
            <span>New password</span>
            <input v-model="passwordForm.next" type="password" />
          </label>
          <label class="set-field">
            <span>Confirm new password</span>
            <input v-model="passwordForm.confirm" type="password" />
          </label>
          <div class="set-field set-field--wide">
            <button class="set-btn set-btn--primary" style="width: fit-content">Update password</button>
          </div>
        </div>

        <div class="set-sessions" :class="{ 'set-sessions--spaced': showPasswordForm }">
          <div v-if="sessionsError" class="set-session__note">{{ sessionsError }}</div>
          <div v-for="s in sessions" :key="s.id" class="set-session">
            <span class="set-session__icon">{{ s.deviceLabel.includes('Android') || s.deviceLabel.includes('iOS') ? '📱' : '💻' }}</span>
            <div class="set-session__info">
              <div class="set-session__title">{{ s.deviceLabel }}</div>
              <div class="set-session__note">
                {{ s.current ? 'Current session' : 'Signed in' }} · since {{ new Date(s.createdAt).toLocaleString() }}
              </div>
            </div>
            <span v-if="s.current" class="set-pill">Current</span>
            <button v-else class="set-btn" @click="handleEndSession(s.id)">End session</button>
          </div>
        </div>
      </div>

      <!-- Danger zone -->
      <div class="set-block set-block--danger">
        <div class="set-block__head">
          <div>
            <h2 class="set-block__title">Sign out</h2>
            <div class="set-block__sub">Sign out from all devices. Manage employees in the Employees section.</div>
          </div>
          <button class="set-btn set-btn--danger" @click="signOutAll">Sign out everywhere</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.set-page {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 28px 56px;
}

.set-content { min-width: 0; display: grid; gap: 16px; }

.set-head { margin-bottom: 4px; }

.set-title {
  margin: 0 0 6px;
  font-size: clamp(34px, 3.6vw, 50px);
  line-height: 0.98;
  letter-spacing: -0.055em;
}
.set-subtitle { margin: 0; color: #66736e; font-size: 14px; }

.set-notice {
  padding: 15px 16px;
  border-radius: 18px;
  border: 1px solid rgba(255, 138, 0, 0.22);
  background: #fff5df;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  color: #573a14;
  font-size: 14px;
  line-height: 1.42;
}
.set-notice strong { display: block; color: #33210a; margin-bottom: 2px; }

/* Blocks */
.set-block {
  background: #fff;
  border: 1px solid #dde7e2;
  border-radius: 20px;
  padding: 20px;
}
.set-block--danger { border-color: #fdd; background: #fff8f8; }

.set-block__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
}
.set-block__title { margin: 0 0 4px; font-size: 18px; font-weight: 950; letter-spacing: -0.03em; }
.set-block__sub { font-size: 13px; color: #66736e; }

.set-block__footer { margin-top: 16px; padding-top: 16px; border-top: 1px solid #edf2ef; }

/* Pills */
.set-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  background: #e2f8ef;
  color: #008a64;
  flex-shrink: 0;
}

/* Buttons */
.set-btn {
  border: 1px solid #dde7e2;
  border-radius: 12px;
  padding: 0 14px;
  min-height: 38px;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  background: #f3f8f6;
  color: #263732;
  transition: 0.14s;
}
.set-btn--primary { background: #00a878; color: #fff; border-color: transparent; }
.set-btn--danger { background: #fff2f1; color: #b42318; border-color: #fdd; }
.set-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* Form */
.set-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.set-form--narrow { max-width: 560px; }

.set-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
  color: #66736e;
}
.set-field--wide { grid-column: 1 / -1; }

.set-field input,
.set-field select {
  border: 1px solid #dde7e2;
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  outline: none;
  background: #fff;
}
.set-field input:focus,
.set-field select:focus {
  border-color: #00a878;
  box-shadow: 0 0 0 3px rgba(0, 168, 120, 0.1);
}

/* Toggle rows */
.set-toggles { display: grid; gap: 0; }
.set-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 0;
  border-bottom: 1px solid #edf2ef;
}
.set-toggle-row:last-child { border-bottom: none; }
.set-toggle-title { font-size: 14px; font-weight: 800; color: #14231f; margin-bottom: 2px; }
.set-toggle-note { font-size: 12px; color: #66736e; }

/* Switch */
.set-switch {
  flex-shrink: 0;
  width: 44px;
  height: 26px;
  border-radius: 999px;
  border: none;
  background: #dde7e2;
  cursor: pointer;
  position: relative;
  transition: background 0.18s;
}
.set-switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  transition: transform 0.18s;
}
.set-switch--on { background: #00a878; }
.set-switch--on::after { transform: translateX(18px); }

/* Segmented control */
.set-segmented {
  display: flex;
  border: 1px solid #dde7e2;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
}
.set-segmented__btn {
  min-height: 34px;
  padding: 0 14px;
  border: none;
  background: #f7fbf9;
  color: #66736e;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: 0.14s;
  border-right: 1px solid #dde7e2;
}
.set-segmented__btn:last-child { border-right: none; }
.set-segmented__btn--active {
  background: #e2f8ef;
  color: #008a64;
}

/* Sessions */
.set-form--password { margin-bottom: 4px; padding-bottom: 16px; border-bottom: 1px solid #edf2ef; }
.set-sessions { display: grid; gap: 8px; }
.set-sessions--spaced { margin-top: 16px; }
.set-session {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #f7fbf9;
  border: 1px solid #edf2ef;
  border-radius: 14px;
}
.set-session__icon { font-size: 20px; flex-shrink: 0; }
.set-session__info { flex: 1; min-width: 0; }
.set-session__title { font-size: 14px; font-weight: 800; color: #14231f; margin-bottom: 2px; }
.set-session__note { font-size: 12px; color: #66736e; }

@media (max-width: 960px) {
  .set-page { grid-template-columns: 1fr; padding-left: 16px; padding-right: 16px; }
  .set-form { grid-template-columns: 1fr; }
  .set-field--wide { grid-column: auto; }
}
</style>
