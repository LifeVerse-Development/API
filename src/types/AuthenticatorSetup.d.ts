export interface IAuthenticatorSetup {
    isEnabled: boolean;
    qrCode: string;
    secret: string;
    verificationCode: string;
    recoveryCodesGenerated: boolean;
    recoveryCodes: string[];
}
