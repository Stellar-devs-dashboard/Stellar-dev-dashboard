import { afterEach, describe, expect, it } from 'vitest'
import { canonicalStringify, generateAttestation, resetSessionKeyPairForTests, verifyAttestation } from '../attestation'
import type { AttestationInput } from '../attestation'

const BASE_INPUT: AttestationInput = {
  id: 'att-1',
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  network: 'testnet',
  manifestId: 'manifest-1',
  candidateLabel: 'abc1234',
  normalizedHash: 'a'.repeat(64),
  rawHash: 'b'.repeat(64),
  onChainHash: 'a'.repeat(64),
  status: 'match',
  generatedAt: '2026-01-01T00:00:00.000Z',
}

describe('canonicalStringify', () => {
  it('produces identical output regardless of key order', () => {
    const a = canonicalStringify({ b: 1, a: 2, c: { z: 1, y: 2 } })
    const b = canonicalStringify({ a: 2, c: { y: 2, z: 1 }, b: 1 })
    expect(a).toBe(b)
  })
})

describe('generateAttestation / verifyAttestation', () => {
  afterEach(() => resetSessionKeyPairForTests())

  it('generates an attestation that verifies successfully', async () => {
    const attestation = await generateAttestation(BASE_INPUT)
    expect(attestation.schemaVersion).toBe(1)
    expect(attestation.signature).toBeTruthy()
    expect(attestation.publicKeyJwk).toBeTruthy()

    const result = await verifyAttestation(attestation)
    expect(result.valid).toBe(true)
    expect(result.reasons).toHaveLength(0)
  })

  it('detects a tampered field (status flipped after signing)', async () => {
    const attestation = await generateAttestation(BASE_INPUT)
    const tampered = { ...attestation, status: 'mismatch' as const }
    const result = await verifyAttestation(tampered)
    expect(result.valid).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/Payload hash/)
  })

  it('detects a tampered normalizedHash', async () => {
    const attestation = await generateAttestation(BASE_INPUT)
    const tampered = { ...attestation, normalizedHash: 'f'.repeat(64) }
    const result = await verifyAttestation(tampered)
    expect(result.valid).toBe(false)
  })

  it('detects a tampered signature even if the payload hash was recomputed to match', async () => {
    const attestation = await generateAttestation(BASE_INPUT)
    const tampered = { ...attestation, signature: attestation.signature.slice(0, -4) + 'AAAA' }
    const result = await verifyAttestation(tampered)
    expect(result.valid).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/Signature|Payload hash/)
  })

  it('rejects an attestation signed with a different session key presented as another key (forged public key mismatch)', async () => {
    const attestation = await generateAttestation(BASE_INPUT)
    resetSessionKeyPairForTests()
    const other = await generateAttestation({ ...BASE_INPUT, id: 'att-2' })
    const forged = { ...attestation, publicKeyJwk: other.publicKeyJwk }
    const result = await verifyAttestation(forged)
    expect(result.valid).toBe(false)
  })

  it('reports missing required fields instead of throwing', async () => {
    const result = await verifyAttestation({ id: 'incomplete' })
    expect(result.valid).toBe(false)
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  it('rejects non-object input', async () => {
    const result = await verifyAttestation('not an attestation')
    expect(result.valid).toBe(false)
  })

  it('rejects an unsupported schema version', async () => {
    const attestation = await generateAttestation(BASE_INPUT)
    const tampered = { ...attestation, schemaVersion: 2 as unknown as 1 }
    const result = await verifyAttestation(tampered)
    expect(result.valid).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/schema version/)
  })
})
