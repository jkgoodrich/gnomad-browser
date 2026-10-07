// DONTMERGE: v4 regional missense constraint for the demo genes until the API serves v4 RMC. Export
// more with export_missense_constraint_3d_fixture.py.
import { RegionalMissenseConstraint } from '../src/RegionalMissenseConstraintTrack'

import KCNQ2 from './regional_missense_constraint_ENSG00000075043.json'
import SCN2A from './regional_missense_constraint_ENSG00000136531.json'
import CACNA1A from './regional_missense_constraint_ENSG00000141837.json'
import HCN1 from './regional_missense_constraint_ENSG00000164588.json'
import PTEN from './regional_missense_constraint_ENSG00000171862.json'
import GRIN2B from './regional_missense_constraint_ENSG00000273079.json'

// Keyed by gene ID. The v4 regions have no z-scores.
const regionalMissenseConstraintFixtures = {
  ENSG00000075043: KCNQ2,
  ENSG00000136531: SCN2A,
  ENSG00000141837: CACNA1A,
  ENSG00000164588: HCN1,
  ENSG00000171862: PTEN,
  ENSG00000273079: GRIN2B,
} as unknown as Record<string, RegionalMissenseConstraint>

export default regionalMissenseConstraintFixtures
