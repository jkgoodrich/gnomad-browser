import React, { useMemo } from 'react'

import ConstraintTrack, {
  RegionAttributeList,
  RegionWithUnclamped,
  regionsInExons,
} from '../ConstraintTrack'
import { GeneTranscript } from '../GenePage/GenePage'
import {
  MissenseObsExpLegend,
  RegionalMissenseConstraint,
  RegionalMissenseConstraintRegion,
} from '../RegionalMissenseConstraintTrack'
import { regionalMissenseConstraintUpperRegionColor } from './missenseConstraint3d'

// For a region attribute list, like a tooltip's
export const RegionalMissenseConstraintRegionAttributes = ({
  region,
}: {
  region: RegionalMissenseConstraintRegion
}) => (
  <>
    <div>
      <dt>Amino acids:</dt>
      <dd>{`${region.aa_start || '-'}-${region.aa_stop || '-'}`}</dd>
    </div>
    <div>
      <dt>Missense observed/expected:</dt>
      <dd>
        {region.obs_exp === null
          ? '-'
          : `${region.obs_exp.toPrecision(4)} (${region.obs_mis}/${
              region.exp_mis === null ? '-' : region.exp_mis.toPrecision(4)
            })`}
      </dd>
    </div>
    <div>
      <dt>Missense o/e upper bound:</dt>
      <dd>
        {region.obs_exp_upper === undefined || region.obs_exp_upper === null
          ? '-'
          : region.obs_exp_upper.toPrecision(4)}
      </dd>
    </div>
    <div>
      <dt>p-value:</dt>
      <dd>{region.p_value.toExponential(3)}</dd>
    </div>
  </>
)

const RegionTooltip = ({
  region,
}: {
  region: RegionWithUnclamped<RegionalMissenseConstraintRegion>
}) => (
  <RegionAttributeList>
    <RegionalMissenseConstraintRegionAttributes region={region} />
  </RegionAttributeList>
)

type Props = {
  regionalMissenseConstraint: RegionalMissenseConstraint
  transcript: GeneTranscript
}

// The regional missense constraint regions, colored by the upper bound of their o/e rather than the
// o/e that the regional missense constraint track shows
const RegionalMissenseConstraintUpperTrack = ({
  regionalMissenseConstraint,
  transcript,
}: Props) => {
  const regions = useMemo(
    () =>
      regionsInExons(
        [...regionalMissenseConstraint.regions],
        transcript.exons.filter((exon) => exon.feature_type === 'CDS')
      ),
    [regionalMissenseConstraint, transcript]
  )

  return (
    <ConstraintTrack
      trackTitle="RMC o/e upper bound"
      // An empty list, unlike null, draws neither region brackets nor a line through the track
      allRegions={[]}
      constrainedRegions={regions}
      infobuttonTopic="regional-constraint"
      legend={<MissenseObsExpLegend title="Regional missense constraint o/e upper bound" />}
      tooltipComponent={RegionTooltip}
      colorFn={regionalMissenseConstraintUpperRegionColor}
      valueFn={() => ''}
    />
  )
}

export default RegionalMissenseConstraintUpperTrack
