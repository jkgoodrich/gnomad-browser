import { describe, expect, jest, test } from '@jest/globals'

import resolvers from './gene-fields'

// Loads its constraint data from static files when imported
jest.mock('./mitochondrial-constraint', () => ({
  resolveMitochondrialGeneConstraint: jest.fn(),
  resolveMitochondialGeneConstraintType: jest.fn(),
  resolveMitochondrialRegionConstraint: jest.fn(),
}))

describe('Gene.missense_constraint_3d', () => {
  test('is null when the Elasticsearch document has an empty object', () => {
    expect(resolvers.Gene.missense_constraint_3d({ missense_constraint_3d: {} })).toBeNull()
  })

  test('returns the stored constraint', () => {
    const missenseConstraint3d = {
      transcript_id: 'ENST00000609686',
      uniprot_id: 'Q13224',
      protein_sequence: 'MKP',
      regions: [],
      uniprot_features: [],
    }
    expect(
      resolvers.Gene.missense_constraint_3d({ missense_constraint_3d: missenseConstraint3d })
    ).toBe(missenseConstraint3d)
  })
})
