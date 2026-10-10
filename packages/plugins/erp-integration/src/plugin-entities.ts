import { StorageLocationAssignment } from './entities/storage-location-assignment.entity';
import { IntegrationOutboxEntry } from './entities/integration-outbox-entry.entity';
import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { KafkaConsumerStatus } from './entities/kafka-consumer-status.entity';
import { KafkaConsumerLagEntry } from './entities/kafka-consumer-lag.entity';
import { ProductTaxCodeFlag } from './entities/product-tax-code-flag.entity';
import { ProductCategoryFlag } from './entities/product-category-flag.entity';
import { Manufacturer } from './entities/manufacturer.entity';
import { ProductPhoto } from './entities/product-photo.entity';
import { ProductVariantBarcode } from './entities/product-variant-barcode.entity';
import { ProductCharacteristic } from './entities/product-characteristic.entity';
import { ProductManufacturerCode } from './entities/product-manufacturer-code.entity';
import { ErpReconciliationIssue } from './entities/erp-reconciliation-issue.entity';
import { UnitRecord } from './entities/unit-record.entity';
import { RegionRecord } from './entities/region-record.entity';
import { LegalFormRecord } from './entities/legal-form-record.entity';
import { BankRecord } from './entities/bank-record.entity';
import { BankAccountRecord } from './entities/bank-account-record.entity';

// Entities registered by ErpIntegrationPlugin.
export const PLUGIN_ENTITIES = [
    StorageLocationAssignment,
    IntegrationOutboxEntry,
    IntegrationInboxEvent,
    KafkaConsumerStatus,
    KafkaConsumerLagEntry,
    ProductTaxCodeFlag,
    ProductCategoryFlag,
    Manufacturer,
    ProductPhoto,
    ProductVariantBarcode,
    ProductCharacteristic,
    ProductManufacturerCode,
    ErpReconciliationIssue,
    UnitRecord,
    RegionRecord,
    LegalFormRecord,
    BankRecord,
    BankAccountRecord,
];
