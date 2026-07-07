import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

@Entity()
@Index(['counterpartyId', 'issueDate'])
@Index('IDX_document_erp_id', ['erpId'], { unique: true, where: '"erpId" IS NOT NULL' })
export class Document extends VendureEntity {
    constructor(input?: DeepPartial<Document>) {
        super(input);
    }

    // 'invoice' | 'contract' | 'return' | 'reconciliation' — business values from ERP
    // or internal generation code paths, not validated against a hardcoded enum.
    @Column({ type: 'varchar' })
    type!: string;

    @Column({ type: 'varchar' })
    counterpartyId!: string;

    @Column({ type: 'varchar', nullable: true })
    orderId!: string | null;

    @Column({ type: 'varchar' })
    number!: string;

    @Column({ type: 'timestamp' })
    issueDate!: Date;

    // Minor currency units (e.g. kopecks).
    @Column({ type: 'bigint', nullable: true })
    amount!: number | null;

    @Column({ type: 'varchar', nullable: true })
    currencyCode!: string | null;

    // Internal technical state, fixed by application logic — OK as a plain varchar
    // with a TS union at the call sites, not a business enum.
    @Column({ type: 'varchar', default: 'pending' })
    status!: 'pending' | 'generating' | 'ready' | 'failed';

    @Column({ type: 'varchar' })
    source!: 'generated' | 'erp';

    // Vendure Asset.id once a self-generated PDF exists.
    @Column({ type: 'varchar', nullable: true })
    assetId!: string | null;

    // ERP-hosted file passthrough for return/reconciliation documents — 1C already
    // serves the file, no need to re-upload it into Vendure's asset storage.
    @Column({ type: 'varchar', nullable: true })
    fileUrl!: string | null;

    // Idempotency key for ERP-pushed documents. Nullable because generated
    // documents (invoice/contract) have no ERP-side natural key.
    @Column({ type: 'varchar', nullable: true })
    erpId!: string | null;

    // Free-form per-type extras (reconciliation period, return reason) — avoids
    // adding narrow columns for a single document type.
    @Column({ type: 'simple-json', nullable: true })
    metadata!: Record<string, unknown> | null;
}
