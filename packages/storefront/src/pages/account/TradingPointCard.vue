<script setup lang="ts">
import { ref, watch } from 'vue';

export interface ContactPerson { id: string; name: string; phone: string | null; isPrimary: boolean }
export interface TradingPoint {
    id: string; name: string; address: string;
    workingHours: string | null; deliveryComment: string | null;
    customerStatus: string; customerOwned: boolean;
    contacts: ContactPerson[];
}

const props = defineProps<{
    point: TradingPoint;
    isCurrent: boolean;
}>();

const emit = defineEmits<{
    save: [id: string, data: { name: string; address: string; contactName: string | null; contactPhone: string | null; workingHours: string | null; deliveryComment: string | null }];
    remove: [id: string];
    setCurrent: [id: string];
}>();

const editing = ref(false);
const confirmRemove = ref(false);
const saving = ref(false);

const primaryContact = () => props.point.contacts.find(c => c.isPrimary) ?? props.point.contacts[0] ?? null;

const form = ref({
    name: '',
    address: '',
    contactName: '',
    contactPhone: '',
    workingHours: '',
    deliveryComment: '',
});

function startEdit() {
    const c = primaryContact();
    form.value = {
        name: props.point.name,
        address: props.point.address,
        contactName: c?.name ?? '',
        contactPhone: c?.phone ?? '',
        workingHours: props.point.workingHours ?? '',
        deliveryComment: props.point.deliveryComment ?? '',
    };
    editing.value = true;
    confirmRemove.value = false;
}

function cancelEdit() {
    editing.value = false;
}

async function handleSave() {
    saving.value = true;
    await emit('save', props.point.id, {
        name: form.value.name,
        address: form.value.address,
        contactName: form.value.contactName || null,
        contactPhone: form.value.contactPhone || null,
        workingHours: form.value.workingHours || null,
        deliveryComment: form.value.deliveryComment || null,
    });
    saving.value = false;
    editing.value = false;
}

watch(() => props.point, () => { editing.value = false; confirmRemove.value = false; });
</script>

<template>
  <article class="tp-card" :class="{ 'tp-card--current': props.isCurrent, 'tp-card--editing': editing }">
    <!-- View mode -->
    <template v-if="!editing">
      <div class="tp-card__head">
        <div class="tp-card__meta">
          <div class="tp-card__name-row">
            <span class="tp-card__name">{{ props.point.name }}</span>
            <span v-if="props.isCurrent" class="tp-card__pill tp-card__pill--green">Current delivery</span>
            <span v-if="props.point.customerOwned" class="tp-card__pill tp-card__pill--blue">Added by you</span>
          </div>
          <div class="tp-card__addr">{{ props.point.address }}</div>
        </div>
        <div class="tp-card__head-actions">
          <button
            v-if="!props.isCurrent"
            class="tp-card__btn tp-card__btn--ghost tp-card__btn--sm"
            @click="emit('setCurrent', props.point.id)"
          >Set as current</button>
          <button class="tp-card__btn tp-card__btn--ghost tp-card__btn--sm" @click="startEdit">Edit</button>
          <button
            v-if="!confirmRemove"
            class="tp-card__btn tp-card__btn--danger tp-card__btn--sm"
            @click="confirmRemove = true"
          >Remove</button>
          <template v-else>
            <button class="tp-card__btn tp-card__btn--danger tp-card__btn--sm" @click="emit('remove', props.point.id)">Confirm remove</button>
            <button class="tp-card__btn tp-card__btn--ghost tp-card__btn--sm" @click="confirmRemove = false">Cancel</button>
          </template>
        </div>
      </div>

      <div v-if="primaryContact() || props.point.workingHours || props.point.deliveryComment" class="tp-card__info">
        <div v-if="primaryContact()" class="tp-card__info-cell">
          <div class="tp-card__info-label">Contact</div>
          <div class="tp-card__info-value">
            {{ primaryContact()!.name }}
            <span v-if="primaryContact()!.phone"><br />{{ primaryContact()!.phone }}</span>
          </div>
        </div>
        <div v-if="props.point.workingHours" class="tp-card__info-cell">
          <div class="tp-card__info-label">Hours</div>
          <div class="tp-card__info-value">{{ props.point.workingHours }}</div>
        </div>
        <div v-if="props.point.deliveryComment" class="tp-card__info-cell">
          <div class="tp-card__info-label">Note</div>
          <div class="tp-card__info-value">{{ props.point.deliveryComment }}</div>
        </div>
      </div>
    </template>

    <!-- Edit mode -->
    <template v-else>
      <div class="tp-card__edit-title">Edit trading point</div>
      <div class="tp-card__form">
        <label class="tp-card__field">
          <span>Name</span>
          <input v-model="form.name" placeholder="e.g. North AutoService" />
        </label>
        <label class="tp-card__field tp-card__field--wide">
          <span>Delivery address</span>
          <input v-model="form.address" placeholder="Full address" />
        </label>
        <label class="tp-card__field">
          <span>Contact person</span>
          <input v-model="form.contactName" placeholder="Full name" />
        </label>
        <label class="tp-card__field">
          <span>Phone</span>
          <input v-model="form.contactPhone" placeholder="+7 ..." type="tel" />
        </label>
        <label class="tp-card__field tp-card__field--wide">
          <span>Working hours</span>
          <input v-model="form.workingHours" placeholder="e.g. Mon–Fri 09:00–18:00" />
        </label>
        <label class="tp-card__field tp-card__field--wide">
          <span>Delivery comment</span>
          <textarea v-model="form.deliveryComment" rows="2" placeholder="Gate code, entry from rear, etc." />
        </label>
      </div>
      <div class="tp-card__edit-actions">
        <button class="tp-card__btn tp-card__btn--primary" :disabled="saving" @click="handleSave">
          {{ saving ? 'Saving…' : 'Save changes' }}
        </button>
        <button class="tp-card__btn tp-card__btn--ghost" @click="cancelEdit">Cancel</button>
      </div>
    </template>
  </article>
</template>

<style scoped>
.tp-card {
  background: #fff;
  border: 1px solid #dde7e2;
  border-radius: 20px;
  overflow: hidden;
  transition: border-color 0.14s;
}

.tp-card--current { border-color: #00a878; box-shadow: 0 0 0 3px rgba(0,168,120,0.1); }
.tp-card--editing { border-color: #00a878; }

.tp-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 20px;
}

.tp-card__name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.tp-card__name { font-size: 17px; font-weight: 900; letter-spacing: -0.03em; color: #14231f; }
.tp-card__addr { font-size: 13px; color: #66736e; }

.tp-card__pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}
.tp-card__pill--green { background: #e2f8ef; color: #008a64; }
.tp-card__pill--blue { background: #eaf4ff; color: #1f65b2; }

.tp-card__head-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; align-items: center; }

.tp-card__info {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 0 20px 16px;
}

.tp-card__info-cell {
  background: #f7fbf9;
  border: 1px solid #edf2ef;
  border-radius: 12px;
  padding: 10px 12px;
}

.tp-card__info-label {
  font-size: 11px;
  font-weight: 800;
  color: #a8b8b2;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.tp-card__info-value { font-size: 13px; font-weight: 700; color: #263732; line-height: 1.35; }

/* Edit mode */
.tp-card__edit-title {
  font-size: 16px;
  font-weight: 900;
  letter-spacing: -0.03em;
  padding: 16px 20px 0;
  color: #14231f;
}

.tp-card__form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 14px 20px 0;
}

.tp-card__field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
  color: #66736e;
}

.tp-card__field--wide { grid-column: 1 / -1; }

.tp-card__field input,
.tp-card__field textarea {
  border: 1px solid #dde7e2;
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
  font-size: 14px;
  outline: none;
  resize: vertical;
}

.tp-card__field input:focus,
.tp-card__field textarea:focus {
  border-color: #00a878;
  box-shadow: 0 0 0 3px rgba(0, 168, 120, 0.1);
}

.tp-card__edit-actions {
  display: flex;
  gap: 8px;
  padding: 14px 20px 18px;
}

/* Buttons */
.tp-card__btn {
  border: 0;
  border-radius: 12px;
  padding: 0 16px;
  min-height: 38px;
  font: inherit;
  font-weight: 800;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: 0.14s ease;
}
.tp-card__btn--primary { background: #00a878; color: #fff; }
.tp-card__btn--ghost { background: #f3f8f6; color: #263732; border: 1px solid #dde7e2; }
.tp-card__btn--danger { background: #fff2f1; color: #b42318; border: 1px solid #fdd; }
.tp-card__btn--sm { min-height: 34px; padding: 0 12px; border-radius: 10px; }
.tp-card__btn:disabled { opacity: 0.6; cursor: not-allowed; }

@media (max-width: 640px) {
  .tp-card__head { flex-direction: column; }
  .tp-card__info { grid-template-columns: 1fr; }
  .tp-card__form { grid-template-columns: 1fr; }
  .tp-card__field--wide { grid-column: auto; }
}
</style>
