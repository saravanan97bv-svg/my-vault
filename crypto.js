/**
 * Heritage Vault v1.0 — Cryptographic Security Engine
 * Zero-Knowledge, Folder-Level Granular Encryption using Web Cryptography API
 * Standards: AES-256-GCM (Authenticated Encryption), PBKDF2 with HMAC-SHA256 (100,000 iterations)
 * 100% Client-Side / Offline / Air-Gapped. No hardcoded passwords, keys, or backdoors.
 */

(function (window) {
    'use strict';

    const SUBTLE = window.crypto && window.crypto.subtle;
    const PBKDF2_ITERATIONS = 100000;
    const KEY_LENGTH_BITS = 256;
    const GCM_IV_LENGTH_BYTES = 12;

    // Helper: ArrayBuffer <-> Hex
    function bufToHex(buffer) {
        const byteArray = new Uint8Array(buffer);
        let hexString = '';
        for (let i = 0; i < byteArray.length; i++) {
            hexString += byteArray[i].toString(16).padStart(2, '0');
        }
        return hexString;
    }

    function hexToBuf(hexString) {
        if (!hexString || hexString.length % 2 !== 0) return new ArrayBuffer(0);
        const byteArray = new Uint8Array(hexString.length / 2);
        for (let i = 0; i < hexString.length; i += 2) {
            byteArray[i / 2] = parseInt(hexString.substr(i, 2), 16);
        }
        return byteArray.buffer;
    }

    // Helper: String <-> UTF-8 ArrayBuffer
    function strToBuf(str) {
        return new TextEncoder().encode(str);
    }

    function bufToStr(buffer) {
        return new TextDecoder().decode(buffer);
    }

    // Generate Cryptographically Secure Random Salt
    function generateSalt(byteLength = 16) {
        const salt = new Uint8Array(byteLength);
        window.crypto.getRandomValues(salt);
        return bufToHex(salt);
    }

    // Generate Random 12-byte IV for AES-GCM
    function generateIV() {
        const iv = new Uint8Array(GCM_IV_LENGTH_BYTES);
        window.crypto.getRandomValues(iv);
        return iv;
    }

    /**
     * Derives an AES-GCM 256-bit CryptoKey from a user passphrase and salt via PBKDF2
     */
    async function deriveKey(passphrase, saltHex) {
        if (!SUBTLE) throw new Error('Web Cryptography API is not available on this device.');
        const passBuf = strToBuf(passphrase);
        const saltBuf = hexToBuf(saltHex);

        const baseKey = await SUBTLE.importKey(
            'raw',
            passBuf,
            { name: 'PBKDF2' },
            false,
            ['deriveKey', 'deriveBits']
        );

        return await SUBTLE.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBuf,
                iterations: PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            baseKey,
            { name: 'AES-GCM', length: KEY_LENGTH_BITS },
            false, // Non-extractable for memory safety
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Compute a secure hash for Master Admin login verification
     */
    async function hashPassphrase(passphrase, saltHex) {
        if (!SUBTLE) throw new Error('Web Cryptography API is not available on this device.');
        const passBuf = strToBuf(passphrase);
        const saltBuf = hexToBuf(saltHex);

        const baseKey = await SUBTLE.importKey(
            'raw',
            passBuf,
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
        );

        const derivedBits = await SUBTLE.deriveBits(
            {
                name: 'PBKDF2',
                salt: saltBuf,
                iterations: PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            baseKey,
            KEY_LENGTH_BITS
        );

        return bufToHex(derivedBits);
    }

    /**
     * Encrypt Plaintext UTF-8 string using an AES-GCM CryptoKey
     * Returns: { iv: hex, cipher: hex }
     */
    async function encryptText(plaintext, cryptoKey) {
        const iv = generateIV();
        const dataBuf = strToBuf(plaintext);

        const cipherBuf = await SUBTLE.encrypt(
            { name: 'AES-GCM', iv: iv },
            cryptoKey,
            dataBuf
        );

        return {
            iv: bufToHex(iv),
            cipher: bufToHex(cipherBuf)
        };
    }

    /**
     * Decrypt AES-GCM ciphertext hex to UTF-8 plaintext string
     */
    async function decryptText(encryptedObj, cryptoKey) {
        if (!encryptedObj || !encryptedObj.iv || !encryptedObj.cipher) {
            throw new Error('Invalid encrypted payload structure.');
        }

        const ivBuf = hexToBuf(encryptedObj.iv);
        const cipherBuf = hexToBuf(encryptedObj.cipher);

        const decryptedBuf = await SUBTLE.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(ivBuf) },
            cryptoKey,
            cipherBuf
        );

        return bufToStr(decryptedBuf);
    }

    /**
     * Encrypt a raw ArrayBuffer (PDF, Image, Video blob)
     * Returns: { iv: hex, cipherBuf: ArrayBuffer }
     */
    async function encryptBinary(arrayBuffer, cryptoKey) {
        const iv = generateIV();
        const cipherBuf = await SUBTLE.encrypt(
            { name: 'AES-GCM', iv: iv },
            cryptoKey,
            arrayBuffer
        );
        return {
            iv: bufToHex(iv),
            cipherBuf: cipherBuf
        };
    }

    /**
     * Decrypt an AES-GCM encrypted ArrayBuffer back to original raw bytes
     */
    async function decryptBinary(cipherBuf, ivHex, cryptoKey) {
        const ivBuf = hexToBuf(ivHex);
        return await SUBTLE.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(ivBuf) },
            cryptoKey,
            cipherBuf
        );
    }

    /**
     * Create Folder Security Package (Called when creating or password-protecting a folder)
     * Generates a unique salt, derives folder key, and creates a verification token
     */
    const VERIFICATION_CANARY = 'HERITAGE_VAULT_FOLDER_VERIFIED_V1';

    async function createFolderSecurity(folderPassword) {
        if (!folderPassword || folderPassword.trim().length === 0) {
            return {
                isProtected: false,
                salt: '',
                token: null
            };
        }

        const salt = generateSalt(16);
        const key = await deriveKey(folderPassword, salt);
        const token = await encryptText(VERIFICATION_CANARY, key);

        return {
            isProtected: true,
            salt: salt,
            token: token
        };
    }

    /**
     * Unlock a Folder with its custom password.
     * Validates by attempting to decrypt the verification token.
     * Returns the unlocked CryptoKey if valid, or throws/returns null if incorrect.
     */
    async function unlockFolder(folderPassword, folderSecurityObj) {
        if (!folderSecurityObj || !folderSecurityObj.isProtected) {
            return { success: true, key: null, isProtected: false };
        }

        try {
            const key = await deriveKey(folderPassword, folderSecurityObj.salt);
            const decrypted = await decryptText(folderSecurityObj.token, key);
            if (decrypted === VERIFICATION_CANARY) {
                return { success: true, key: key, isProtected: true };
            }
            return { success: false, error: 'Incorrect folder password.' };
        } catch (e) {
            return { success: false, error: 'Incorrect folder password.' };
        }
    }

    /**
     * Generate Unique Cryptographic Vault Cluster ID (Anti-Tamper Cross-APK Lock)
     * Format: HV-XXXX-XXXX-XXXX-XXXX
     */
    function generateVaultClusterId() {
        const bytes = new Uint8Array(8);
        window.crypto.getRandomValues(bytes);
        const hex = bufToHex(bytes).toUpperCase();
        return `HV-${hex.substring(0, 4)}-${hex.substring(4, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}`;
    }

    // Export API
    window.HeritageCrypto = {
        generateSalt,
        generateVaultClusterId,
        deriveKey,
        hashPassphrase,
        encryptText,
        decryptText,
        encryptBinary,
        decryptBinary,
        createFolderSecurity,
        unlockFolder
    };

})(typeof window !== 'undefined' ? window : this);
