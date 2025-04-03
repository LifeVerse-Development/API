/**
 * Validates an email address
 * @param email Email address to validate
 * @returns Boolean indicating if the email is valid
 */
export const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

/**
 * Validates a password
 * @param password Password to validate
 * @returns Boolean indicating if the password is valid
 */
export const validatePassword = (password: string): boolean => {
    // At least 8 characters, one uppercase, one lowercase, one number, one special character
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
};

/**
 * Sanitizes user input to prevent XSS attacks
 * @param input Input string to sanitize
 * @returns Sanitized string
 */
export const sanitizeInput = (input: string): string => {
    if (!input) return input;

    // Replace HTML special characters with their entity equivalents
    return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
};
