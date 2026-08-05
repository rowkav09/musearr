import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, hashPassword, verifyPassword } from './secrets.js'

const encryptionKey = randomBytes(32).toString('base64')

describe('secret protection', () => {
  it('round-trips encrypted Plex credentials without exposing the plaintext', () => {
    const encrypted = encryptSecret('plex-token-for-test-only', encryptionKey)

    expect(encrypted).not.toContain('plex-token-for-test-only')
    expect(decryptSecret(encrypted, encryptionKey)).toBe('plex-token-for-test-only')
  })

  it('uses a salted, verifiable password hash', async () => {
    const hash = await hashPassword('this-is-a-safe-test-password')

    expect(hash).not.toContain('this-is-a-safe-test-password')
    await expect(verifyPassword('this-is-a-safe-test-password', hash)).resolves.toBe(true)
    await expect(verifyPassword('not-the-password', hash)).resolves.toBe(false)
  })
})
