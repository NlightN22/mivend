import { CategoryStreamHandler } from './handlers/category.handler';
import { PriceStreamHandler } from './handlers/price.handler';
import { PriceTypeStreamHandler } from './handlers/price-type.handler';
import { ProductStreamHandler } from './handlers/product.handler';
import { StockStreamHandler } from './handlers/stock.handler';
import { WarehouseStreamHandler } from './handlers/warehouse.handler';
import { OrganizationStreamHandler } from './handlers/organization.handler';
import { DepartmentStreamHandler } from './handlers/department.handler';
import { PositionStreamHandler } from './handlers/position.handler';
import { CounterpartyStreamHandler } from './handlers/counterparty.handler';
import { CounterpartyCreditBalanceStreamHandler } from './handlers/counterparty-credit-balance.handler';
import { StockOrganizationStreamHandler } from './handlers/stock-organization.handler';
import { StorageLocationStreamHandler } from './handlers/storage-location.handler';
import { UserStreamHandler } from './handlers/user.handler';
import { OrderRegistrationResultHandler } from './handlers/order-registration-result.handler';
import { OrderCancelResultHandler } from './handlers/order-cancel-result.handler';
import { OrderChangedStreamHandler } from './handlers/order-changed.handler';
import { PromoRuleStreamHandler } from './handlers/promo-rule.handler';
import { DiscountSetupStreamHandler } from './handlers/discount-setup.handler';
import { GrantedDiscountStreamHandler } from './handlers/granted-discount.handler';
import { RetroBonusSetupStreamHandler } from './handlers/retro-bonus-setup.handler';
import { GrantedRetroBonusStreamHandler } from './handlers/granted-retro-bonus.handler';
import { VatRateStreamHandler } from './handlers/vat-rate.handler';
import { PointOfSaleStreamHandler } from './handlers/point-of-sale.handler';
import { ContractStreamHandler } from './handlers/contract.handler';
import { UnitStreamHandler } from './handlers/unit.handler';
import { ManufacturerStreamHandler } from './handlers/manufacturer.handler';
import { RegionStreamHandler } from './handlers/region.handler';
import { LegalFormStreamHandler } from './handlers/legal-form.handler';
import { BankStreamHandler } from './handlers/bank.handler';
import { BankAccountStreamHandler } from './handlers/bank-account.handler';
import { ProductPhotoStreamHandler } from './handlers/product-photo.handler';
import { SettlementDocumentStreamHandler } from './handlers/settlement-document.handler';
import { SettlementDocumentTypeStreamHandler } from './handlers/settlement-document-type.handler';
import { OrderStatusStreamHandler } from './handlers/order-status.handler';
import { SettlementBalanceStreamHandler } from './handlers/settlement-balance.handler';

// One provider per inbound stream; IntegrationInboxProcessorService maps stream -> handler.
export const STREAM_HANDLERS = [
    CategoryStreamHandler,
    PriceStreamHandler,
    PriceTypeStreamHandler,
    ProductStreamHandler,
    StockStreamHandler,
    WarehouseStreamHandler,
    OrganizationStreamHandler,
    DepartmentStreamHandler,
    PositionStreamHandler,
    CounterpartyStreamHandler,
    CounterpartyCreditBalanceStreamHandler,
    StorageLocationStreamHandler,
    StockOrganizationStreamHandler,
    UserStreamHandler,
    OrderRegistrationResultHandler,
    OrderChangedStreamHandler,
    OrderCancelResultHandler,
    PromoRuleStreamHandler,
    DiscountSetupStreamHandler,
    GrantedDiscountStreamHandler,
    RetroBonusSetupStreamHandler,
    GrantedRetroBonusStreamHandler,
    VatRateStreamHandler,
    PointOfSaleStreamHandler,
    ContractStreamHandler,
    UnitStreamHandler,
    ManufacturerStreamHandler,
    RegionStreamHandler,
    LegalFormStreamHandler,
    BankStreamHandler,
    BankAccountStreamHandler,
    ProductPhotoStreamHandler,
    SettlementDocumentStreamHandler,
    SettlementBalanceStreamHandler,
    SettlementDocumentTypeStreamHandler,
    OrderStatusStreamHandler,
];
