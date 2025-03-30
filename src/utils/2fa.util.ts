import * as speakeasy from "speakeasy"
import * as qrcode from "qrcode"

/**
 * Generates a QR code for two-factor authentication
 * @param identifier User identifier (email or username)
 * @returns Object containing QR code URL, secret, and otpauth URL
 */
export const generateQRCode = async (
  identifier: string,
): Promise<{ qrCode: string; secret: string; otpauthUrl: string }> => {
  // Generate a secret
  const secret = speakeasy.generateSecret({
    name: `LifeVerse:${identifier}`,
  })

  // Generate QR code
  const qrCode = await qrcode.toDataURL(secret.otpauth_url || "")

  return {
    qrCode,
    secret: secret.base32,
    otpauthUrl: secret.otpauth_url || "",
  }
}

/**
 * Verifies a TOTP code
 * @param secret Secret key
 * @param token Token to verify
 * @returns Boolean indicating if the token is valid
 */
export const verifyTOTP = (secret: string, token: string): boolean => {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: 1, // Allow 1 step before and after for clock drift
  })
}

/**
 * Generates recovery codes
 * @param count Number of recovery codes to generate
 * @returns Array of recovery codes
 */
export const generateRecoveryCodes = (count = 10): string[] => {
  const codes: string[] = []

  for (let i = 0; i < count; i++) {
    // Generate a random code in format XXXX-XXXX-XXXX
    const part1 = Math.random().toString(36).substring(2, 6).toUpperCase()
    const part2 = Math.random().toString(36).substring(2, 6).toUpperCase()
    const part3 = Math.random().toString(36).substring(2, 6).toUpperCase()

    codes.push(`${part1}-${part2}-${part3}`)
  }

  return codes
}

