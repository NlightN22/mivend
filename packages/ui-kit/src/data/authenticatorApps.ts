export interface AuthenticatorApp {
    name: string;
    playStoreUrl: string;
    appStoreUrl: string;
}

export const AUTHENTICATOR_APPS: readonly AuthenticatorApp[] = [
    {
        name: 'Google Authenticator',
        playStoreUrl:
            'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2',
        appStoreUrl: 'https://apps.apple.com/app/google-authenticator/id388497605',
    },
    {
        name: 'Microsoft Authenticator',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=com.azure.authenticator',
        appStoreUrl: 'https://apps.apple.com/app/microsoft-authenticator/id983156458',
    },
    {
        name: '2FAS Auth',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=com.twofasapp',
        appStoreUrl: 'https://apps.apple.com/app/2fas-auth/id1217793794',
    },
    {
        name: 'FreeOTP',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=org.fedorahosted.freeotp',
        appStoreUrl: 'https://apps.apple.com/app/freeotp-authenticator/id872559395',
    },
];
