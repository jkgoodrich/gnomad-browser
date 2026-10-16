// DONTMERGE: v4 regional missense constraint for the demo genes until the API serves v4 RMC. Export
// more with export_missense_constraint_3d_fixture.py.
import { RegionalMissenseConstraint } from '../src/RegionalMissenseConstraintTrack'

import CREBBP from './regional_missense_constraint_ENSG00000005339.json'
import ATP6V0A1 from './regional_missense_constraint_ENSG00000033627.json'
import FOXC1 from './regional_missense_constraint_ENSG00000054598.json'
import SMC1A from './regional_missense_constraint_ENSG00000072501.json'
import KCNQ2 from './regional_missense_constraint_ENSG00000075043.json'
import TBX5 from './regional_missense_constraint_ENSG00000089225.json'
import AGO1 from './regional_missense_constraint_ENSG00000092847.json'
import USP11 from './regional_missense_constraint_ENSG00000102226.json'
import NALCN from './regional_missense_constraint_ENSG00000102452.json'
import HTR2A from './regional_missense_constraint_ENSG00000102468.json'
import PPP2R1A from './regional_missense_constraint_ENSG00000105568.json'
import GRIK5 from './regional_missense_constraint_ENSG00000105737.json'
import EBF3 from './regional_missense_constraint_ENSG00000108001.json'
import PMP22 from './regional_missense_constraint_ENSG00000109099.json'
import FOXP1 from './regional_missense_constraint_ENSG00000114861.json'
import PRRX1 from './regional_missense_constraint_ENSG00000116132.json'
import SLC2A1 from './regional_missense_constraint_ENSG00000117394.json'
import UBIAD1 from './regional_missense_constraint_ENSG00000120942.json'
import PIK3CA from './regional_missense_constraint_ENSG00000121879.json'
import KDM5C from './regional_missense_constraint_ENSG00000126012.json'
import GNAI1 from './regional_missense_constraint_ENSG00000127955.json'
import FOXA1 from './regional_missense_constraint_ENSG00000129514.json'
import MNX1 from './regional_missense_constraint_ENSG00000130675.json'
import SLC6A8 from './regional_missense_constraint_ENSG00000130821.json'
import TRAF7 from './regional_missense_constraint_ENSG00000131653.json'
import SCN2A from './regional_missense_constraint_ENSG00000136531.json'
import HECW2 from './regional_missense_constraint_ENSG00000138411.json'
import PPP3CA from './regional_missense_constraint_ENSG00000138814.json'
import CACNA1A from './regional_missense_constraint_ENSG00000141837.json'
import KCNH1 from './regional_missense_constraint_ENSG00000143473.json'
import SCN1A from './regional_missense_constraint_ENSG00000144285.json'
import GABRB2 from './regional_missense_constraint_ENSG00000145864.json'
import HK1 from './regional_missense_constraint_ENSG00000156515.json'
import ATP2B2 from './regional_missense_constraint_ENSG00000157087.json'
import CACNA1D from './regional_missense_constraint_ENSG00000157388.json'
import LMBRD2 from './regional_missense_constraint_ENSG00000164187.json'
import HCN1 from './regional_missense_constraint_ENSG00000164588.json'
import DDB1 from './regional_missense_constraint_ENSG00000167986.json'
import BEST1 from './regional_missense_constraint_ENSG00000167995.json'
import MECP2 from './regional_missense_constraint_ENSG00000169057.json'
import CHD3 from './regional_missense_constraint_ENSG00000170004.json'
import KCNK3 from './regional_missense_constraint_ENSG00000171303.json'
import PTEN from './regional_missense_constraint_ENSG00000171862.json'
import ADCY5 from './regional_missense_constraint_ENSG00000173175.json'
import SPTBN2 from './regional_missense_constraint_ENSG00000173898.json'
import BRSK2 from './regional_missense_constraint_ENSG00000174672.json'
import PACS1 from './regional_missense_constraint_ENSG00000175115.json'
import GRIN1 from './regional_missense_constraint_ENSG00000176884.json'
import DEAF1 from './regional_missense_constraint_ENSG00000177030.json'
import SATB1 from './regional_missense_constraint_ENSG00000182568.json'
import USP7 from './regional_missense_constraint_ENSG00000187555.json'
import WDR45 from './regional_missense_constraint_ENSG00000196998.json'
import SLC9A6 from './regional_missense_constraint_ENSG00000198689.json'
import CTR9 from './regional_missense_constraint_ENSG00000198730.json'
import GRIN2B from './regional_missense_constraint_ENSG00000273079.json'

// Keyed by gene ID. The v4 regions have no z-scores, and genes that weren't searched, like those on
// chrX, have no regions.
const regionalMissenseConstraintFixtures = {
  ENSG00000005339: CREBBP,
  ENSG00000033627: ATP6V0A1,
  ENSG00000054598: FOXC1,
  ENSG00000072501: SMC1A,
  ENSG00000075043: KCNQ2,
  ENSG00000089225: TBX5,
  ENSG00000092847: AGO1,
  ENSG00000102226: USP11,
  ENSG00000102452: NALCN,
  ENSG00000102468: HTR2A,
  ENSG00000105568: PPP2R1A,
  ENSG00000105737: GRIK5,
  ENSG00000108001: EBF3,
  ENSG00000109099: PMP22,
  ENSG00000114861: FOXP1,
  ENSG00000116132: PRRX1,
  ENSG00000117394: SLC2A1,
  ENSG00000120942: UBIAD1,
  ENSG00000121879: PIK3CA,
  ENSG00000126012: KDM5C,
  ENSG00000127955: GNAI1,
  ENSG00000129514: FOXA1,
  ENSG00000130675: MNX1,
  ENSG00000130821: SLC6A8,
  ENSG00000131653: TRAF7,
  ENSG00000136531: SCN2A,
  ENSG00000138411: HECW2,
  ENSG00000138814: PPP3CA,
  ENSG00000141837: CACNA1A,
  ENSG00000143473: KCNH1,
  ENSG00000144285: SCN1A,
  ENSG00000145864: GABRB2,
  ENSG00000156515: HK1,
  ENSG00000157087: ATP2B2,
  ENSG00000157388: CACNA1D,
  ENSG00000164187: LMBRD2,
  ENSG00000164588: HCN1,
  ENSG00000167986: DDB1,
  ENSG00000167995: BEST1,
  ENSG00000169057: MECP2,
  ENSG00000170004: CHD3,
  ENSG00000171303: KCNK3,
  ENSG00000171862: PTEN,
  ENSG00000173175: ADCY5,
  ENSG00000173898: SPTBN2,
  ENSG00000174672: BRSK2,
  ENSG00000175115: PACS1,
  ENSG00000176884: GRIN1,
  ENSG00000177030: DEAF1,
  ENSG00000182568: SATB1,
  ENSG00000187555: USP7,
  ENSG00000196998: WDR45,
  ENSG00000198689: SLC9A6,
  ENSG00000198730: CTR9,
  ENSG00000273079: GRIN2B,
} as unknown as Record<string, RegionalMissenseConstraint>

export default regionalMissenseConstraintFixtures
