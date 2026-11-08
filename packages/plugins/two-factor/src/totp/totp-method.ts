import type { SecondFactorMethod } from './second-factor-method';
import { generateSecret, otpauthUri, verifyTotp } from './totp';

export const totpMethod: SecondFactorMethod = {
    id: 'totp',
    createSecret: generateSecret,
    enrolmentUri: otpauthUri,
    verify: verifyTotp,
};
