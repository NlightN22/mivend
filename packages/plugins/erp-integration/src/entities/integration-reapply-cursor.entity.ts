import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Progress of the one-off contact reapply (ContactReapplyService), one row per stream.
@Entity('integration_reapply_cursor')
export class IntegrationReapplyCursor {
    @PrimaryColumn({ type: 'varchar' })
    stream!: string;

    // Last inbox row id handled; a bigint column arrives as a string.
    @Column({ type: 'bigint', default: 0 })
    lastId!: string;

    @Column({ type: 'boolean', default: false })
    done!: boolean;

    @Column({ type: 'int', default: 0 })
    applied!: number;

    @Column({ type: 'int', default: 0 })
    skipped!: number;

    // Single-flight lease: a running tick holds it, a crashed one lets it lapse.
    @Column({ type: 'timestamptz', nullable: true })
    lockedUntil!: Date | null;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt!: Date;
}
