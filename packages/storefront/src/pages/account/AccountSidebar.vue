<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();
const route = useRoute();

const initials = computed(() => {
    const name = authStore.counterparty?.shortName ?? '';
    if (name.length >= 2) return name.slice(0, 2).toUpperCase();
    const first = authStore.customer?.firstName?.[0] ?? '';
    const last = authStore.customer?.lastName?.[0] ?? '';
    return (first + last).toUpperCase() || '?';
});

const companyName = computed(() =>
    authStore.counterparty?.shortName ?? authStore.customer?.firstName ?? '—',
);

const role = computed(() => authStore.customer?.customFields?.portalRole ?? '—');

const isActive = (path: string) => route.path === path;
</script>

<template>
  <aside class="account-sidebar">
    <div class="account-sidebar__user-card">
      <div class="account-sidebar__avatar">{{ initials }}</div>
      <div>
        <div class="account-sidebar__name">{{ companyName }}</div>
        <div class="account-sidebar__role">{{ authStore.counterparty?.legalName }}<br />{{ role }}</div>
      </div>
    </div>

    <div class="account-sidebar__section-title">Customer Zone</div>
    <nav class="account-sidebar__menu">
      <RouterLink to="/account" class="account-sidebar__link" :class="{ 'account-sidebar__link--active': isActive('/account') }">
        <span>Home</span>
      </RouterLink>
      <RouterLink to="/orders" class="account-sidebar__link" :class="{ 'account-sidebar__link--active': isActive('/orders') }">
        <span>Orders</span><span class="account-sidebar__count">8</span>
      </RouterLink>
      <RouterLink to="/documents" class="account-sidebar__link" :class="{ 'account-sidebar__link--active': isActive('/documents') }">
        <span>Documents</span><span class="account-sidebar__count">12</span>
      </RouterLink>
      <RouterLink to="/favorites" class="account-sidebar__link" :class="{ 'account-sidebar__link--active': isActive('/favorites') }">
        <span>Favorites</span><span class="account-sidebar__count">34</span>
      </RouterLink>
      <RouterLink to="/requests" class="account-sidebar__link" :class="{ 'account-sidebar__link--active': isActive('/requests') }">
        <span>Requests</span><span class="account-sidebar__count">2</span>
      </RouterLink>
    </nav>

    <div class="account-sidebar__section-title">Company</div>
    <nav class="account-sidebar__menu">
      <RouterLink to="/account/trading-points" class="account-sidebar__link" :class="{ 'account-sidebar__link--active': isActive('/account/trading-points') }">
        <span>Trading points</span><span class="account-sidebar__count">4</span>
      </RouterLink>
      <RouterLink to="/account/balance" class="account-sidebar__link" :class="{ 'account-sidebar__link--active': isActive('/account/balance') }">
        <span>Balance &amp; Limits</span>
      </RouterLink>
      <a href="#" class="account-sidebar__link"><span>Employees</span></a>
      <a href="#" class="account-sidebar__link"><span>Settings</span></a>
    </nav>
  </aside>
</template>

<style scoped>
.account-sidebar {
  position: sticky;
  top: 118px;
  background: #fff;
  border: 1px solid rgba(221, 231, 226, 0.86);
  border-radius: 28px;
  box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
  padding: 20px;
}

.account-sidebar__user-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 18px;
  margin-bottom: 18px;
  border-bottom: 1px solid #edf2ef;
}

.account-sidebar__avatar {
  width: 70px;
  height: 70px;
  border-radius: 50%;
  background: linear-gradient(145deg, #e2f8ef, #f4fbff);
  color: #008a64;
  display: grid;
  place-items: center;
  font-size: 25px;
  font-weight: 950;
  flex-shrink: 0;
}

.account-sidebar__name {
  font-weight: 950;
  letter-spacing: -0.03em;
  font-size: 18px;
  margin-bottom: 4px;
}

.account-sidebar__role {
  color: #66736e;
  font-size: 13px;
  line-height: 1.3;
}

.account-sidebar__section-title {
  margin: 18px 0 8px;
  color: #263732;
  font-size: 13px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.035em;
}

.account-sidebar__menu {
  display: grid;
  gap: 4px;
}

.account-sidebar__link {
  min-height: 38px;
  padding: 0 10px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #263732;
  font-weight: 750;
  font-size: 14px;
  text-decoration: none;
}

.account-sidebar__link:hover {
  background: #f4faf7;
}

.account-sidebar__link--active {
  background: #e2f8ef;
  color: #008a64;
  font-weight: 950;
}

.account-sidebar__count {
  min-width: 22px;
  height: 22px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #eef4f1;
  color: #66736e;
  font-size: 12px;
  font-weight: 900;
}

@media (max-width: 960px) {
  .account-sidebar { position: static; }
}
</style>
