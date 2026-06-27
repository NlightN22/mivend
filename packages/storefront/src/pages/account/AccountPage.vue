<script setup lang="ts">
import AccountSidebar from './AccountSidebar.vue';
import AccountHero from './AccountHero.vue';
import AccountStatusCards from './AccountStatusCards.vue';
import AccountRecentOrders from './AccountRecentOrders.vue';
import AccountQuickActions from './AccountQuickActions.vue';
import AccountDocuments from './AccountDocuments.vue';
import AccountTradingPointInfo from './AccountTradingPointInfo.vue';
import AccountFrequentProducts from './AccountFrequentProducts.vue';
</script>

<template>
  <div class="account-page">
    <div class="account-page__layout">
      <AccountSidebar />

      <section class="account-page__content">
        <AccountHero />
        <AccountStatusCards />
        <AccountRecentOrders />
        <AccountQuickActions />

        <div class="account-page__two-col">
          <AccountDocuments />
          <AccountTradingPointInfo />
        </div>

        <AccountFrequentProducts />
      </section>
    </div>
  </div>
</template>

<style scoped>
.account-page {
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 28px 56px;
}

.account-page__layout {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.account-page__content { min-width: 0; }

.account-page__two-col {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 22px;
  margin-bottom: 22px;
}

@media (max-width: 960px) {
  .account-page__layout { grid-template-columns: 1fr; }
  .account-page__two-col { grid-template-columns: 1fr; }
}

@media (max-width: 620px) {
  .account-page { padding-left: 16px; padding-right: 16px; }
}
</style>
