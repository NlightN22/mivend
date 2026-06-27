<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../../stores/auth';
import AccountSidebar from './AccountSidebar.vue';
import TradingPointCard from './TradingPointCard.vue';
import type { TradingPoint } from './TradingPointCard.vue';

const authStore = useAuthStore();
const preferredId = computed(() => authStore.customer?.customFields?.preferredTradingPointId ?? null);

const visiblePoints = ref<TradingPoint[]>([]);
const hiddenPoints = ref<TradingPoint[]>([]);
const showHidden = ref(false);
const loading = ref(true);
const addOpen = ref(false);
const addSaving = ref(false);
const addForm = ref({ name: '', address: '', contactName: '', contactPhone: '', workingHours: '', deliveryComment: '' });

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

async function handleSave(id: string, data: { name: string; address: string; contactName: string | null; contactPhone: string | null; workingHours: string | null; deliveryComment: string | null }) {
    await GQL(`mutation($id:ID! $name:String! $address:String! $contactName:String $contactPhone:String $workingHours:String $deliveryComment:String){
      customerEditTradingPoint(id:$id name:$name address:$address contactName:$contactName contactPhone:$contactPhone workingHours:$workingHours deliveryComment:$deliveryComment){ id }
    }`, { id, ...data });
    await loadPoints();
}

async function handleRemove(id: string) {
    await GQL(`mutation($id:ID!){ customerDeleteTradingPoint(id:$id) }`, { id });
    await loadPoints();
}

async function handleRestore(id: string) {
    await GQL(`mutation($id:ID!){ customerRestoreTradingPoint(id:$id){ id } }`, { id });
    await loadPoints();
}

async function handleSetCurrent(id: string) {
    await GQL(`mutation($id:ID!){ setPreferredTradingPoint(tradingPointId:$id) }`, { id });
    await authStore.fetchCurrentCustomer();
}

function openAdd() {
    addForm.value = { name: '', address: '', contactName: '', contactPhone: '', workingHours: '', deliveryComment: '' };
    addOpen.value = true;
}

async function submitAdd() {
    if (!addForm.value.name || !addForm.value.address) return;
    addSaving.value = true;
    await GQL(`mutation($name:String! $address:String! $contactName:String $contactPhone:String $workingHours:String $deliveryComment:String){
      customerAddTradingPoint(name:$name address:$address contactName:$contactName contactPhone:$contactPhone workingHours:$workingHours deliveryComment:$deliveryComment){ id }
    }`, {
        name: addForm.value.name,
        address: addForm.value.address,
        contactName: addForm.value.contactName || null,
        contactPhone: addForm.value.contactPhone || null,
        workingHours: addForm.value.workingHours || null,
        deliveryComment: addForm.value.deliveryComment || null,
    });
    addSaving.value = false;
    addOpen.value = false;
    await loadPoints();
}

onMounted(loadPoints);
</script>

<template>
  <div class="tp-page">
    <AccountSidebar />

    <section class="tp-content">
      <div class="tp-head">
        <div>
          <h1 class="tp-title">Trading Points</h1>
          <p class="tp-subtitle">Delivery addresses for your company. Add, edit or remove them anytime.</p>
        </div>
        <div class="tp-head-actions">
          <button
            v-if="hiddenPoints.length"
            class="tp-btn tp-btn--ghost"
            @click="showHidden = !showHidden"
          >
            {{ showHidden ? 'Hide removed' : `Removed (${hiddenPoints.length})` }}
          </button>
          <button class="tp-btn tp-btn--primary" @click="openAdd">+ Add point</button>
        </div>
      </div>

      <!-- Add form -->
      <div v-if="addOpen" class="tp-add-card">
        <div class="tp-add-title">New trading point</div>
        <div class="tp-form">
          <label class="tp-field">
            <span>Name</span>
            <input v-model="addForm.name" placeholder="e.g. North AutoService" />
          </label>
          <label class="tp-field tp-field--wide">
            <span>Delivery address</span>
            <input v-model="addForm.address" placeholder="Full address" />
          </label>
          <label class="tp-field">
            <span>Contact person</span>
            <input v-model="addForm.contactName" placeholder="Full name" />
          </label>
          <label class="tp-field">
            <span>Phone</span>
            <input v-model="addForm.contactPhone" placeholder="+7 ..." type="tel" />
          </label>
          <label class="tp-field tp-field--wide">
            <span>Working hours</span>
            <input v-model="addForm.workingHours" placeholder="e.g. Mon–Fri 09:00–18:00" />
          </label>
          <label class="tp-field tp-field--wide">
            <span>Delivery comment</span>
            <textarea v-model="addForm.deliveryComment" rows="2" placeholder="Gate code, entry from rear, etc." />
          </label>
        </div>
        <div class="tp-add-actions">
          <button class="tp-btn tp-btn--primary" :disabled="addSaving || !addForm.name || !addForm.address" @click="submitAdd">
            {{ addSaving ? 'Saving…' : 'Add point' }}
          </button>
          <button class="tp-btn tp-btn--ghost" @click="addOpen = false">Cancel</button>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!loading && !visiblePoints.length && !addOpen" class="tp-empty">
        <span>📍</span>
        <div>No delivery addresses yet. Add your first trading point.</div>
      </div>

      <!-- Active list -->
      <div class="tp-list">
        <TradingPointCard
          v-for="pt in visiblePoints"
          :key="pt.id"
          :point="pt"
          :is-current="pt.id === preferredId"
          @save="handleSave"
          @remove="handleRemove"
          @set-current="handleSetCurrent"
        />
      </div>

      <!-- Removed -->
      <template v-if="showHidden && hiddenPoints.length">
        <div class="tp-section-label">Removed points</div>
        <div class="tp-list">
          <div v-for="pt in hiddenPoints" :key="pt.id" class="tp-removed-card">
            <div>
              <div class="tp-removed-name">{{ pt.name }}</div>
              <div class="tp-removed-addr">{{ pt.address }}</div>
            </div>
            <button class="tp-btn tp-btn--ghost tp-btn--sm" @click="handleRestore(pt.id)">Restore</button>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.tp-page {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 28px 56px;
}

.tp-content { min-width: 0; }

.tp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.tp-title {
  margin: 0 0 6px;
  font-size: clamp(34px, 3.6vw, 50px);
  line-height: 0.98;
  letter-spacing: -0.055em;
}

.tp-subtitle { color: #66736e; font-size: 14px; margin: 0; }
.tp-head-actions { display: flex; gap: 8px; flex-shrink: 0; }

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
.tp-btn--primary { background: #00a878; color: #fff; }
.tp-btn--ghost { background: #f3f8f6; color: #263732; border: 1px solid #dde7e2; }
.tp-btn--sm { min-height: 34px; padding: 0 12px; font-size: 13px; border-radius: 10px; }
.tp-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.tp-add-card {
  background: #fff;
  border: 1px solid #00a878;
  border-radius: 20px;
  padding: 18px 20px;
  margin-bottom: 16px;
}

.tp-add-title {
  font-size: 16px;
  font-weight: 900;
  letter-spacing: -0.03em;
  margin-bottom: 14px;
}

.tp-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}

.tp-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
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

.tp-add-actions { display: flex; gap: 8px; }

.tp-empty {
  text-align: center;
  padding: 64px 24px;
  color: #66736e;
  font-size: 15px;
  display: grid;
  gap: 12px;
}

.tp-empty span { font-size: 40px; }

.tp-list { display: grid; gap: 12px; margin-bottom: 20px; }

.tp-section-label {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #a8b8b2;
  margin-bottom: 10px;
}

.tp-removed-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  background: #fff;
  border: 1px solid #dde7e2;
  border-radius: 16px;
  opacity: 0.7;
}

.tp-removed-name { font-size: 15px; font-weight: 800; color: #14231f; margin-bottom: 3px; }
.tp-removed-addr { font-size: 13px; color: #66736e; }

@media (max-width: 960px) {
  .tp-page { grid-template-columns: 1fr; padding-left: 16px; padding-right: 16px; }
  .tp-form { grid-template-columns: 1fr; }
  .tp-field--wide { grid-column: auto; }
}

@media (max-width: 640px) {
  .tp-head { flex-direction: column; }
}
</style>
