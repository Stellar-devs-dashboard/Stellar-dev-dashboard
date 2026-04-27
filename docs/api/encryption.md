# encryption.js

AES-GCM encryption for sensitive data using the Web Crypto API. No external dependencies.

## Functions

### `encrypt(plaintext, passphrase)`

Encrypts a string using AES-256-GCM. Derives a key from the passphrase using PBKDF2.

```js
import { encrypt } from './src/lib/encryption';

const result = await encrypt('S...secret-key...', 'my-passphrase');
// result: { ciphertext: string, iv: string, salt: string }
```

| Param | Type | Description |
|-------|------|-------------|
| plaintext | string | Data to encrypt |
| passphrase | string | User-provided passphrase for key derivation |

Returns: `Promise<{ ciphertext: string, iv: string, salt: string }>`

All values are base64-encoded strings safe for storage.

---

### `decrypt(ciphertext, passphrase, iv, salt)`

Decrypts data encrypted with `encrypt()`.

```js
import { decrypt } from './src/lib/encryption';

const secret = await decrypt(stored.ciphertext, 'my-passphrase', stored.iv, stored.salt);
```

Returns: `Promise<string>`

Throws if the passphrase is wrong or data is corrupted.

---

### `generateKey()`

Generates a random 256-bit encryption key as a base64 string. Useful for app-level encryption without a user passphrase.

```js
import { generateKey } from './src/lib/encryption';

const key = await generateKey();
```

Returns: `Promise<string>` (base64)

---

## Security Notes

- Keys are derived using PBKDF2 with 100,000 iterations and SHA-256
- Each encryption call generates a fresh random IV and salt
- AES-256-GCM provides both confidentiality and integrity (authenticated encryption)
- Never store the passphrase alongside the ciphertext
- For production use, consider hardware wallet signing instead of local key storage
