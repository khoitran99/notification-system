import { describe, it, expect } from 'vitest'
import { SHARED_VERSION } from '@notification/shared'

describe('workspace cross-package import', () => {
  it('can import SHARED_VERSION from @notification/shared', () => {
    expect(SHARED_VERSION).toBe('0.0.1')
  })
})
