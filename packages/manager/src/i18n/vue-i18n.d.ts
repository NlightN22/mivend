import type { MessageSchema } from './locales';

declare module 'vue-i18n' {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    export interface DefineLocaleMessage extends MessageSchema {}
}
