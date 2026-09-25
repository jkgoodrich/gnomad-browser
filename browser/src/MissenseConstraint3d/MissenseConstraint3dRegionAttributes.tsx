import React from 'react'

import {
  MissenseConstraint3dRegion,
  RANKED_REGION_COLORS,
  RANKED_REGION_MAX_P_VALUE,
} from './missenseConstraint3d'

const regionDescription = (region: MissenseConstraint3dRegion, rank: number | undefined) => {
  if (region.is_catch_all) {
    return 'Catch-all'
  }
  if (rank !== undefined) {
    return `#${rank + 1} most constrained`
  }
  if (region.p_value > RANKED_REGION_MAX_P_VALUE) {
    return `Not significant (p > ${RANKED_REGION_MAX_P_VALUE.toExponential()})`
  }
  return `Outside the ${RANKED_REGION_COLORS.length} most constrained`
}

type Props = {
  region: MissenseConstraint3dRegion
  rank: number | undefined
}

const MissenseConstraint3dRegionAttributes = ({ region, rank }: Props) => (
  <>
    <div>
      <dt>Region:</dt>
      <dd>{regionDescription(region, rank)}</dd>
    </div>
    <div>
      <dt>Missense observed/expected:</dt>
      <dd>{`${region.obs_exp.toPrecision(4)} (${region.obs_mis}/${region.exp_mis.toPrecision(
        4
      )})`}</dd>
    </div>
    <div>
      <dt>Missense o/e upper bound:</dt>
      <dd>{region.oe_upper.toPrecision(4)}</dd>
    </div>
    <div>
      <dt>p-value:</dt>
      <dd>{region.p_value.toExponential(3)}</dd>
    </div>
  </>
)

export default MissenseConstraint3dRegionAttributes
