// DONTMERGE: v4 regional missense constraint for the demo genes until the API serves v4 RMC. Export
// more with export_missense_constraint_3d_fixture.py.
import { RegionalMissenseConstraint } from '../src/RegionalMissenseConstraintTrack'

import FOXC1 from './regional_missense_constraint_ENSG00000054598.json'
import SMC1A from './regional_missense_constraint_ENSG00000072501.json'
import KCNQ2 from './regional_missense_constraint_ENSG00000075043.json'
import TBX5 from './regional_missense_constraint_ENSG00000089225.json'
import NALCN from './regional_missense_constraint_ENSG00000102452.json'
import HTR2A from './regional_missense_constraint_ENSG00000102468.json'
import PMP22 from './regional_missense_constraint_ENSG00000109099.json'
import PRRX1 from './regional_missense_constraint_ENSG00000116132.json'
import UBIAD1 from './regional_missense_constraint_ENSG00000120942.json'
import KDM5C from './regional_missense_constraint_ENSG00000126012.json'
import GNAI1 from './regional_missense_constraint_ENSG00000127955.json'
import FOXA1 from './regional_missense_constraint_ENSG00000129514.json'
import MNX1 from './regional_missense_constraint_ENSG00000130675.json'
import SLC6A8 from './regional_missense_constraint_ENSG00000130821.json'
import SCN2A from './regional_missense_constraint_ENSG00000136531.json'
import PPP3CA from './regional_missense_constraint_ENSG00000138814.json'
import CACNA1A from './regional_missense_constraint_ENSG00000141837.json'
import GABRB2 from './regional_missense_constraint_ENSG00000145864.json'
import HCN1 from './regional_missense_constraint_ENSG00000164588.json'
import BEST1 from './regional_missense_constraint_ENSG00000167995.json'
import CHD3 from './regional_missense_constraint_ENSG00000170004.json'
import PTEN from './regional_missense_constraint_ENSG00000171862.json'
import GRIN1 from './regional_missense_constraint_ENSG00000176884.json'
import USP7 from './regional_missense_constraint_ENSG00000187555.json'
import SLC9A6 from './regional_missense_constraint_ENSG00000198689.json'
import GRIN2B from './regional_missense_constraint_ENSG00000273079.json'

// Keyed by gene ID. The v4 regions have no z-scores, and genes that weren't searched, like those on
// chrX, have no regions.
const regionalMissenseConstraintFixtures = {
  ENSG00000054598: FOXC1,
  ENSG00000072501: SMC1A,
  ENSG00000075043: KCNQ2,
  ENSG00000089225: TBX5,
  ENSG00000102452: NALCN,
  ENSG00000102468: HTR2A,
  ENSG00000109099: PMP22,
  ENSG00000116132: PRRX1,
  ENSG00000120942: UBIAD1,
  ENSG00000126012: KDM5C,
  ENSG00000127955: GNAI1,
  ENSG00000129514: FOXA1,
  ENSG00000130675: MNX1,
  ENSG00000130821: SLC6A8,
  ENSG00000136531: SCN2A,
  ENSG00000138814: PPP3CA,
  ENSG00000141837: CACNA1A,
  ENSG00000145864: GABRB2,
  ENSG00000164588: HCN1,
  ENSG00000167995: BEST1,
  ENSG00000170004: CHD3,
  ENSG00000171862: PTEN,
  ENSG00000176884: GRIN1,
  ENSG00000187555: USP7,
  ENSG00000198689: SLC9A6,
  ENSG00000273079: GRIN2B,
} as unknown as Record<string, RegionalMissenseConstraint>

export default regionalMissenseConstraintFixtures
