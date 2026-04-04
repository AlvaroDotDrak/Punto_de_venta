/**
 * Crypto utilities — PIN hashing and basic data encryption
 * Uses Web Crypto API (available in all modern browsers)
 */

/**
 * Hash a PIN using SHA-256
 * @param {string} pin - plaintext PIN
 * @returns {Promise<string>} hex-encoded hash
 */
export async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + '_pasteleria_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a PIN against a stored hash
 * @param {string} pin - plaintext PIN to verify
 * @param {string} storedHash - stored hash to compare against
 * @returns {Promise<boolean>}
 */
export async function verifyPin(pin, storedHash) {
  if (!storedHash) return true; // No PIN set = open access
  const inputHash = await hashPin(pin);
  return inputHash === storedHash;
}

// Pre-computed hashes for seed data (computed from hashPin)
// Admin: '1234' → will be computed at seed time
// Vendedor 1: '0000' → will be computed at seed time

/**
 * Generate an encryption key from a passphrase
 */
async function getKey(passphrase = 'pasteleria_pos_key_2026') {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('pasteleria_salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt sensitive data string
 * @param {string} data - data to encrypt
 * @returns {Promise<string>} base64 encoded encrypted data
 */
export async function encryptData(data) {
  try {
    const key = await getKey();
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(data)
    );
    // Combine iv + encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch {
    return data; // Fallback: return plain if crypto fails
  }
}

/**
 * Decrypt encrypted data string
 * @param {string} encryptedBase64 - base64 encoded encrypted data
 * @returns {Promise<string>} decrypted data
 */
export async function decryptData(encryptedBase64) {
  try {
    const key = await getKey();
    const combined = new Uint8Array(
      atob(encryptedBase64).split('').map(c => c.charCodeAt(0))
    );
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return encryptedBase64; // Fallback: return as-is if decryption fails
  }
}
