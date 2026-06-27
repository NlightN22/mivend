<template>
  <div class="tp-page">
    <div class="tp-header">
      <div>
        <h1 class="tp-title">Trading Points</h1>
        <p class="tp-subtitle">Delivery addresses for your company. Add, edit or remove them anytime.</p>
      </div>
      <div class="tp-header-actions">
        <button v-if="hiddenPoints.length" class="tp-btn tp-btn--ghost" @click="showHidden = !showHidden">
          {{ showHidden ? 'Hide removed' : `Removed (${hiddenPoints.length})` }}
        </button>
        <button class="tp-btn tp-btn--primary" @click="openAdd">+ Add point</button>
      </div>
    </div>

    <!-- Hidden / removed section -->
    <div v-if="showHidden && hiddenPoints.length" class="tp-section">
      <div class="tp-section-label">Removed points</div>
      <div class="tp-list">
        <div v-for="pt in hiddenPoints" :key="pt.id" class="tp-card tp-card--hidden">
          <div class="tp-card-head">
            <div>
              <div class="tp-card-name">{{ pt.name }}</div>
              <div class="tp-card-addr">{{ pt.address }}</div>
            </div>
            <button class="tp-btn tp-btn--ghost tp-btn--sm" @click="restore(pt.id)">Restore</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Notice -->
    <div v-if="!loading && visiblePoints.length === 0 && !showHidden" class="tp-empty">
      <span class="tp-empty-icon">📍</span>
      <div>No delivery addresses yet. Add your first trading point.</div>
    </div>

    <!-- Active list -->
    <div class="tp-list">
      <article
        v-for="pt in visiblePoints"
        :key="pt.id"
        class="tp-card"
        :class="{ 'tp-card--preferred': pt.id === preferredId }"
      >
        <div class="tp-card-head">
          <div class="tp-card-meta">
            <div class="tp-card-name-row">
              <span class="tp-card-name">{{ pt.name }}</span>
              <span v-if="pt.id === preferredId" class="tp-pill tp-pill--green">Current delivery</span>
              <span v-if="pt.customerOwned" class="tp-pill tp-pill--blue">Added by you</span>
            </div>
            <div class="tp-card-addr">{{ pt.address }}</div>
          </div>
          <button class="tp-fav" :class="{ active: pt.id === preferredId }" @click="setPreferred(pt.id)" :title="pt.id === preferredId ? 'Preferred' : 'Set as preferred'">
            {{ pt.id === preferredId ? '♥' : '♡' }}
          </button>
        </div>

        <div class="tp-card-body">
          <div class="tp-info-grid">
            <div v-if="primaryContact(pt)" class="tp-info-cell">
              <div class="tp-info-label">Contact</div>
              <div class="tp-info-value">{{ primaryContact(pt)!.name }}<br v-if="primaryContact(pt)!.phone" /><span v-if="primaryContact(pt)!.phone">{{ primaryContact(pt)!.phone }}</span></div>
            </div>
            <div v-if="pt.workingHours" class="tp-info-cell">
              <div class="tp-info-label">Hours</div>
              <div class="tp-info-value">{{ pt.workingHours }}</div>
            </div>
            <div v-if="pt.deliveryComment" class="tp-info-cell">
              <div class="tp-info-label">Note</div>
              <div class="tp-info-value">{{ pt.deliveryComment }}</div>
            </div>
          </div>

          <div class="tp-card-actions">
            <button v-if="pt.id !== preferredId" class="tp-btn tp-btn--ghost tp-btn--sm" @click="setPreferred(pt.id)">Set as current</button>
            <button class="tp-btn tp-btn--ghost tp-btn--sm" @click="openEdit(pt)">Edit</button>
            <button class="tp-btn tp-btn--danger tp-btn--sm" @click="remove(pt.id)">Remove</button>
          </div>
        </div>
      </article>
    </div>

    <!-- Add / Edit drawer -->
    <div v-if="drawerOpen" class="tp-overlay" @click.self="closeDrawer">
      <div class="tp-drawer">
        <div class="tp-drawer-title">{{ editingId ? 'Edit Trading Point' : 'Add Trading Point' }}</div>

        <div class="tp-form-grid">
          <label class="tp-field">
            <span>Name</span>
            <input v-model="form.name" placeholder="e.g. North AutoService" />
          </label>
          <label class="tp-field tp-field--wide">
            <span>Delivery address</span>
            <input v-model="form.address" placeholder="Full address" />
          </label>
          <label class="tp-field">
            <span>Contact person</span>
            <input v-model="form.contactName" placeholder="Full name" />
          </label>
          <label class="tp-field">
            <span>Phone</span>
            <input v-model="form.contactPhone" placeholder="+7 ..." type="tel" />
          </label>
          <label class="tp-field tp-field--wide">
            <span>Working hours</span>
            <input v-model="form.workingHours" placeholder="e.g. Mon–Fri 09:00–18:00" />
          </label>
          <label class="tp-field tp-field--wide">
            <span>Delivery comment</span>
            <textarea v-model="form.deliveryComment" rows="3" placeholder="Gate code, entry from rear, etc." />
          </label>
        </div>

        <div class="tp-drawer-actions">
          <button class="tp-btn tp-btn--primary" :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : (editingId ? 'Save changes' : 'Add point') }}
          </button>
          <button class="tp-btn tp-btn--ghost" @click="closeDrawer">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../../stores/auth';

interface ContactPerson { id: string; name: string; phone: string | null; isPrimary: boolean }
interface TradingPoint {
  id: string; name: string; address: string;
  workingHours: string | null; deliveryComment: string | null;
  customerStatus: string; customerOwned: boolean;
  contacts: ContactPerson[];
}

const authStore = useAuthStore();
const preferredId = computed(() => authStore.customer?.customFields?.preferredTradingPointId ?? null);

const visiblePoints = ref<TradingPoint[]>([]);
const hiddenPoints = ref<TradingPoint[]>([]);
const showHidden = ref(false);
const loading = ref(true);
const saving = ref(false);

const drawerOpen = ref(false);
const editingId = ref<string | null>(null);
const form = ref({ name: '', address: '', contactName: '', contactPhone: '', workingHours: '', deliveryComment: '' });

const primaryContact = (pt: TradingPoint) => pt.contacts.find(c => c.isPrimary) ?? pt.contacts[0] ?? null;

const GQL = (query: string, variables?: Record<string, unknown>) =>
  fetch('/shop-api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ query, variables }),
  }).then(r => r.json());

const POINT_FIELDS = `id name address workingHours deliveryComment customerStatus customerOwned
  contacts { id name phone isPrimary }`;

async function loadPoints() {
  loading.value = true;
  const [vis, hid] = await Promise.all([
    GQL(`{ myTradingPoints { ${POINT_FIELDS} } }`),
    GQL(`{ myHiddenTradingPoints { ${POINT_FIELDS} } }`),
  ]);
  visiblePoints.value = vis.data?.myTradingPoints ?? [];
  hiddenPoints.value = hid.data?.myHiddenTradingPoints ?? [];
  loading.value = false;
}

function openAdd() {
  editingId.value = null;
  form.value = { name: '', address: '', contactName: '', contactPhone: '', workingHours: '', deliveryComment: '' };
  drawerOpen.value = true;
}

function openEdit(pt: TradingPoint) {
  editingId.value = pt.id;
  const c = primaryContact(pt);
  form.value = {
    name: pt.name,
    address: pt.address,
    contactName: c?.name ?? '',
    contactPhone: c?.phone ?? '',
    workingHours: pt.workingHours ?? '',
    deliveryComment: pt.deliveryComment ?? '',
  };
  drawerOpen.value = true;
}

function closeDrawer() {
  drawerOpen.value = false;
  editingId.value = null;
}

async function save() {
  saving.value = true;
  const vars = {
    name: form.value.name,
    address: form.value.address,
    contactName: form.value.contactName || null,
    contactPhone: form.value.contactPhone || null,
    workingHours: form.value.workingHours || null,
    deliveryComment: form.value.deliveryComment || null,
  };
  if (editingId.value) {
    await GQL(`mutation($id:ID! $name:String! $address:String! $contactName:String $contactPhone:String $workingHours:String $deliveryComment:String){
      customerEditTradingPoint(id:$id name:$name address:$address contactName:$contactName contactPhone:$contactPhone workingHours:$workingHours deliveryComment:$deliveryComment){ id }
    }`, { id: editingId.value, ...vars });
  } else {
    await GQL(`mutation($name:String! $address:String! $contactName:String $contactPhone:String $workingHours:String $deliveryComment:String){
      customerAddTradingPoint(name:$name address:$address contactName:$contactName contactPhone:$contactPhone workingHours:$workingHours deliveryComment:$deliveryComment){ id }
    }`, vars);
  }
  saving.value = false;
  closeDrawer();
  await loadPoints();
}

async function remove(id: string) {
  await GQL(`mutation($id:ID!){ customerDeleteTradingPoint(id:$id) }`, { id });
  await loadPoints();
}

async function restore(id: string) {
  await GQL(`mutation($id:ID!){ customerRestoreTradingPoint(id:$id){ id } }`, { id });
  await loadPoints();
}

async function setPreferred(id: string) {
  await GQL(`mutation($id:ID!){ setPreferredTradingPoint(tradingPointId:$id) }`, { id });
  await authStore.fetchCurrentCustomer();
}

onMounted(loadPoints);
</script>

<style scoped>
.tp-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 32px 24px 64px;
}

.tp-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
}

.tp-title {
  margin: 0 0 6px;
  font-size: 28px;
  font-weight: 900;
  letter-spacing: -0.04em;
  color: #14231f;
}

.tp-subtitle { color: #66736e; font-size: 14px; margin: 0; }

.tp-header-actions { display: flex; gap: 8px; flex-shrink: 0; }

.tp-btn {
  border: 0;
  border-radius: 12px;
  padding: 0 16px;
  min-height: 40px;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  transition: 0.14s ease;
}
.tp-btn:hover { transform: translateY(-1px); }
.tp-btn--primary { background: #00a878; color: #fff; }
.tp-btn--ghost { background: #f3f8f6; color: #263732; border: 1px solid #dde7e2; }
.tp-btn--danger { background: #fff2f1; color: #b42318; border: 1px solid #fdd; }
.tp-btn--sm { min-height: 34px; padding: 0 12px; font-size: 13px; border-radius: 10px; }
.tp-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

.tp-section { margin-bottom: 24px; }
.tp-section-label {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #a8b8b2;
  margin-bottom: 10px;
}

.tp-list { display: grid; gap: 12px; }

.tp-empty {
  text-align: center;
  padding: 64px 24px;
  color: #66736e;
  font-size: 15px;
}
.tp-empty-icon { display: block; font-size: 40px; margin-bottom: 12px; }

.tp-card {
  background: #fff;
  border: 1px solid #dde7e2;
  border-radius: 20px;
  overflow: hidden;
}
.tp-card--preferred { border-color: #00a878; box-shadow: 0 0 0 3px rgba(0,168,120,0.1); }
.tp-card--hidden { opacity: 0.7; }

.tp-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f5f2;
}

.tp-card-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.tp-card-name { font-size: 17px; font-weight: 900; letter-spacing: -0.03em; color: #14231f; }
.tp-card-addr { font-size: 13px; color: #66736e; }

.tp-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}
.tp-pill--green { background: #e2f8ef; color: #008a64; }
.tp-pill--blue { background: #eaf4ff; color: #1f65b2; }

.tp-fav {
  border: 1px solid #dde7e2;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  background: #fff;
  color: #a4afa9;
  font-size: 18px;
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: 0.14s;
}
.tp-fav.active { color: #ff4f88; border-color: #ffd2df; background: #fff7fa; }

.tp-card-body { padding: 14px 20px 16px; }

.tp-info-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.tp-info-cell {
  background: #f7fbf9;
  border: 1px solid #edf2ef;
  border-radius: 12px;
  padding: 10px 12px;
}
.tp-info-label { font-size: 11px; font-weight: 800; color: #a8b8b2; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
.tp-info-value { font-size: 13px; font-weight: 700; color: #263732; line-height: 1.35; }

.tp-card-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* Drawer */
.tp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 35, 31, 0.45);
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
}

.tp-drawer {
  background: #fff;
  width: 420px;
  max-width: 100vw;
  height: 100vh;
  overflow-y: auto;
  padding: 32px 28px;
  box-shadow: -8px 0 32px rgba(20, 35, 31, 0.12);
  display: flex;
  flex-direction: column;
  gap: 0;
}

.tp-drawer-title {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.04em;
  color: #14231f;
  margin-bottom: 24px;
}

.tp-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.tp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #66736e;
}
.tp-field--wide { grid-column: 1 / -1; }

.tp-field input,
.tp-field textarea {
  border: 1px solid #dde7e2;
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  outline: none;
  resize: vertical;
}
.tp-field input:focus,
.tp-field textarea:focus {
  border-color: #00a878;
  box-shadow: 0 0 0 3px rgba(0, 168, 120, 0.1);
}

.tp-drawer-actions {
  display: grid;
  gap: 8px;
  margin-top: 24px;
}

@media (max-width: 640px) {
  .tp-header { flex-direction: column; }
  .tp-info-grid { grid-template-columns: 1fr; }
  .tp-form-grid { grid-template-columns: 1fr; }
  .tp-field--wide { grid-column: auto; }
}
</style>
