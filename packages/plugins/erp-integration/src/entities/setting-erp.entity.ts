import { ErpMirrorEntity } from 'shared';
import { Column, Entity, Index } from 'typeorm';

// Last state of the `setting` stream: a base-wide ERP flag by code. Nothing in mivend reads it yet.
@Entity()
export class SettingErp extends ErpMirrorEntity {
    @Index({ unique: true })
    @Column({ type: 'varchar' })
    erpId!: string;

    @Column({ type: 'varchar', nullable: true })
    code!: string | null;

    @Column({ type: 'boolean', nullable: true })
    boolValue!: boolean | null;

    @Column({ type: 'boolean', default: false })
    isDeleted!: boolean;
}
