import { NativeAuthenticationMethod } from '@vendure/core';
import type { EntitySubscriberInterface, UpdateEvent } from 'typeorm';

// Any path that stores a new password hash (change, reset, admin set) ends a forced change.
export class PasswordChangeFlagSubscriber implements EntitySubscriberInterface<NativeAuthenticationMethod> {
    listenTo(): typeof NativeAuthenticationMethod {
        return NativeAuthenticationMethod;
    }

    async afterUpdate(event: UpdateEvent<NativeAuthenticationMethod>): Promise<void> {
        if (!event.updatedColumns.some(column => column.propertyName === 'passwordHash')) return;
        await event.manager.query(
            `UPDATE "user" SET "customFieldsPasswordchangerequired" = false
             WHERE id = (SELECT "userId" FROM authentication_method WHERE id = $1)`,
            [event.entity?.id],
        );
    }
}
