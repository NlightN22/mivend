import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

export type ProductPhotoStatus = 'pending' | 'downloaded' | 'failed';

// One normalized photo from the `product-photo` stream, keyed by the ERP attached-file id.
// Metadata only; the binary lives in the Vendure Asset referenced by `assetId`.
@Entity()
export class ProductPhoto extends VendureEntity {
    constructor(input?: DeepPartial<ProductPhoto>) {
        super(input);
    }

    @Index({ unique: true })
    @Column({ type: 'varchar' })
    externalId!: string;

    @Index()
    @Column({ type: 'varchar' })
    productExternalId!: string;

    @Column({ type: 'varchar', nullable: true })
    contentHash!: string | null;

    @Column({ type: 'varchar', nullable: true })
    mimeType!: string | null;

    @Column({ type: 'int', default: 0 })
    position!: number;

    @Column({ type: 'text', nullable: true })
    downloadUrl!: string | null;

    @Column({ type: 'timestamp', nullable: true })
    downloadUrlExpiresAt!: Date | null;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;

    @Column({ type: 'varchar', default: 'pending' })
    status!: ProductPhotoStatus;

    @Column({ type: 'varchar', nullable: true })
    assetId!: string | null;

    @Column({ type: 'int', default: 0 })
    replayAttempts!: number;

    @Column({ type: 'timestamp', nullable: true })
    lastReplayAt!: Date | null;

    @Column({ type: 'text', nullable: true })
    lastError!: string | null;
}
