import { randomUUID } from 'node:crypto';
import { VendureEntity } from '@vendure/core';
import { BeforeInsert, Column, Index } from 'typeorm';

// Assigned in-process via @BeforeInsert, not a DB-side default — docs/identifiers.md requires
// the uuid to be readable on the in-memory entity before the insert commits, not only after.
export abstract class UuidEntity extends VendureEntity {
    @Index({ unique: true })
    @Column({ type: 'uuid' })
    uuid!: string;

    @BeforeInsert()
    assignUuid(): void {
        if (!this.uuid) {
            this.uuid = randomUUID();
        }
    }
}
