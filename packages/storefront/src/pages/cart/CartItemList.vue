<script setup lang="ts">
import { ref, computed } from 'vue';
import { useCartStore } from '../../stores/cart';
import CartItem from './CartItem.vue';

const cartStore = useCartStore();
const checkedIds = ref(new Set<string>());
const confirmingClear = ref(false);

const allChecked = computed(() =>
    cartStore.lines.length > 0 && cartStore.lines.every(l => checkedIds.value.has(l.id)),
);

function toggleAll(checked: boolean): void {
    if (checked) {
        checkedIds.value = new Set(cartStore.lines.map(l => l.id));
    } else {
        checkedIds.value = new Set();
    }
}

function setChecked(id: string, value: boolean): void {
    const next = new Set(checkedIds.value);
    if (value) next.add(id);
    else next.delete(id);
    checkedIds.value = next;
}

const hasSelection = computed(() => checkedIds.value.size > 0);

async function confirmClear(): Promise<void> {
    confirmingClear.value = false;
    if (hasSelection.value) {
        await cartStore.removeItems([...checkedIds.value]);
        checkedIds.value = new Set();
    } else {
        await cartStore.clearCart();
    }
}

function cancelClear(): void {
    confirmingClear.value = false;
}
</script>

<template>
  <section class="item-list">
    <div class="item-list__toolbar">
      <label class="item-list__check-all">
        <input
          type="checkbox"
          :checked="allChecked"
          @change="toggleAll(($event.target as HTMLInputElement).checked)"
        />
        <span>Select all</span>
      </label>
      <div class="item-list__actions">
        <div v-if="confirmingClear" class="item-list__clear-confirm">
          <span>{{ hasSelection ? `Remove ${checkedIds.size} selected?` : 'Clear all?' }}</span>
          <button class="item-list__clear-confirm-yes" type="button" @click="confirmClear">Yes</button>
          <button class="item-list__clear-confirm-no" type="button" @click="cancelClear">No</button>
        </div>
        <button
          v-else
          class="item-list__action"
          type="button"
          :disabled="cartStore.lines.length === 0"
          @click="confirmingClear = true"
        >
          {{ hasSelection ? `Clear selected (${checkedIds.size})` : 'Clear' }}
        </button>
      </div>
    </div>

    <div class="item-list__spacer" />

    <div class="item-list__section-title">
      <span>Available to order</span>
      <small>{{ cartStore.lines.length }} items · stock reserved after confirmation</small>
    </div>

    <div class="item-list__items">
      <CartItem
        v-for="line in cartStore.lines"
        :key="line.id"
        :line="line"
        :checked="checkedIds.has(line.id)"
        @update:checked="setChecked(line.id, $event)"
      />
    </div>

    <div class="item-list__note">
      <span>ℹ</span>
      <span>Cart shows the current procurement order for your trading point. Delivery method and final limit checks happen at checkout.</span>
    </div>
  </section>
</template>

<style scoped>
.item-list {
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.86);
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  overflow: hidden;
}

.item-list__toolbar {
  min-height: 64px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #edf2ef;
}

.item-list__check-all {
  display: inline-flex; align-items: center; gap: 10px;
  font-weight: 850; cursor: pointer;
}
.item-list__check-all input { width: 20px; height: 20px; margin: 0; accent-color: #00a878; }

.item-list__actions { display: flex; align-items: center; gap: 8px; }

.item-list__action {
  min-height: 36px; border: none; border-radius: 12px;
  padding: 0 12px; background: #f4faf7; color: #5d6d67;
  font-size: 13px; font-weight: 850; cursor: pointer; font-family: inherit;
}
.item-list__action:hover { background: #e2f8ef; color: #008a64; }
.item-list__action:disabled { opacity: 0.45; cursor: not-allowed; }

.item-list__clear-confirm {
  display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 800; color: #66736e;
}
.item-list__clear-confirm-yes {
  height: 32px; padding: 0 10px; border: none; border-radius: 10px;
  background: #fff0ee; color: #f04438; font-size: 12px; font-weight: 900;
  cursor: pointer; font-family: inherit;
}
.item-list__clear-confirm-yes:hover { background: #fde3e0; }
.item-list__clear-confirm-no {
  height: 32px; padding: 0 10px; border: none; border-radius: 10px;
  background: #f4faf7; color: #66736e; font-size: 12px; font-weight: 900;
  cursor: pointer; font-family: inherit;
}
.item-list__clear-confirm-no:hover { background: #e2f8ef; color: #008a64; }

.item-list__spacer { height: 16px; }

.item-list__section-title {
  margin: 0 16px;
  padding: 14px 16px;
  border-radius: 18px;
  background: #f6f9f8;
  font-size: 17px;
  font-weight: 950;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}
.item-list__section-title small { color: #66736e; font-size: 13px; font-weight: 800; }

.item-list__items { padding: 0 16px 4px; }

.item-list__note {
  margin: 0 16px 18px;
  padding: 14px 16px;
  border-radius: 18px;
  background: #f7fbfa;
  color: #50615b;
  font-size: 14px;
  line-height: 1.45;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
</style>
