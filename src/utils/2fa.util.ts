import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

// Funktion zum Einrichten des Authentifikators
export const setupAuthenticator = async (user: any) => {
  const secret = speakeasy.generateSecret({
    name: `LifeVerse (${user.username})`,
    length: 20,
  });

  // Überprüfen, ob der OTP Auth URL generiert wurde
  if (!secret.otpauth_url) {
    throw new Error('Failed to generate OTP auth URL');
  }

  // QR-Code generieren
  const qrCode = await QRCode.toDataURL(secret.otpauth_url);

  return {
    qrCode,
    secret: secret.base32,
  };
};

// Funktion zum Verifizieren des Authentifikators
export const verifyAuthenticator = (secret: string, verificationCode: string) => {
  const isVerified = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: verificationCode,
  });

  return isVerified;
};

// Funktion zum Generieren von Wiederherstellungscodes
export const generateRecoveryCodes = () => {
  const recoveryCodes: string[] = [];

  for (let i = 0; i < 10; i++) {
    const code = speakeasy.generateSecret({ length: 6 }).base32;
    recoveryCodes.push(code);
  }

  return recoveryCodes;
};
