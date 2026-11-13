import enElement from 'element-plus/es/locale/lang/en';
import ruElement from 'element-plus/es/locale/lang/ru';

const ELEMENT_LOCALES: Record<string, typeof enElement> = { en: enElement, ru: ruElement };

export function elementLocale(locale: string): typeof enElement {
    return ELEMENT_LOCALES[locale] ?? enElement;
}
