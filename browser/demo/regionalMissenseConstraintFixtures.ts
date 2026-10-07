// DONTMERGE: v4 regional missense constraint for the demo genes until the API serves v4 RMC. Export
// more with export_missense_constraint_3d_fixture.py.
import { RegionalMissenseConstraint } from '../src/RegionalMissenseConstraintTrack'

import SMC1A from './regional_missense_constraint_ENSG00000072501.json'
import KCNQ2 from './regional_missense_constraint_ENSG00000075043.json'
import NALCN from './regional_missense_constraint_ENSG00000102452.json'
import KDM5C from './regional_missense_constraint_ENSG00000126012.json'
import GNAI1 from './regional_missense_constraint_ENSG00000127955.json'
import SCN2A from './regional_missense_constraint_ENSG00000136531.json'
import PPP3CA from './regional_missense_constraint_ENSG00000138814.json'
import CACNA1A from './regional_missense_constraint_ENSG00000141837.json'
import HCN1 from './regional_missense_constraint_ENSG00000164588.json'
import CHD3 from './regional_missense_constraint_ENSG00000170004.json'
import PTEN from './regional_missense_constraint_ENSG00000171862.json'
import GRIN1 from './regional_missense_constraint_ENSG00000176884.json'
import USP7 from './regional_missense_constraint_ENSG00000187555.json'
import GRIN2B from './regional_missense_constraint_ENSG00000273079.json'

// Keyed by gene ID. The v4 regions have no z-scores, and genes on chrX have no regions.
const regionalMissenseConstraintFixtures = {
  ENSG00000072501: SMC1A,
  ENSG00000075043: KCNQ2,
  ENSG00000102452: NALCN,
  ENSG00000126012: KDM5C,
  ENSG00000127955: GNAI1,
  ENSG00000136531: SCN2A,
  ENSG00000138814: PPP3CA,
  ENSG00000141837: CACNA1A,
  ENSG00000164588: HCN1,
  ENSG00000170004: CHD3,
  ENSG00000171862: PTEN,
  ENSG00000176884: GRIN1,
  ENSG00000187555: USP7,
  ENSG00000273079: GRIN2B,
} as unknown as Record<string, RegionalMissenseConstraint>

export default regionalMissenseConstraintFixtures
