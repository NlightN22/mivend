import { DeepPartial } from '@vendure/common/lib/shared-types';
import { UuidEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

@Entity()
@Index(['counterpartyId', 'issueDate'])
@Index('IDX_document_erp_id', ['erpId'], { unique: true, where: '"erpId" IS NOT NULL' })
export class Document extends UuidEntity {
    constructor(input?: DeepPartial<Document>) {
        super(input);
    }

    // 'proforma invoice' | 'contract' | 'return' | 'reconciliation' — business values from ERP
    // or internal generation code paths, not validated against a hardcoded enum.
    @Column({ type: 'varchar' })
    type!: string;

    @Column({ type: 'varchar' })
    counterpartyId!: string;

    @Column({ type: 'varchar', nullable: true })
    orderId!: string | null;

    // Null for legacy/ERP-pushed documents that predate per-organization proforma splitting,
    // and for non-proforma documents such as contracts.
    @Column({ type: 'varchar', nullable: true })
    proformaInvoiceId!: string | null;

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

    // ERP-hosted file passthrough for return/reconciliation documents — ERP already
    // serves the file, no need to re-upload it into Vendure's asset storage.
    @Column({ type: 'varchar', nullable: true })
    fileUrl!: string | null;

    // Idempotency key for ERP-pushed documents. Nullable because generated
    // documents (proforma invoice/contract) have no ERP-side natural key.
    @Column({ type: 'varchar', nullable: true })
    erpId!: string | null;

    // Free-form per-type extras (reconciliation period, return reason) — avoids
    // adding narrow columns for a single document type.
    @Column({ type: 'simple-json', nullable: true })
    metadata!: Record<string, unknown> | null;
}
