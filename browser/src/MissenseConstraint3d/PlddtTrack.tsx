import React, { useMemo } from 'react'

import ConstraintTrack, {
  RegionAttributeList,
  RegionWithUnclamped,
  regionsInExons,
} from '../ConstraintTrack'
import { GeneTranscript, Strand } from '../GenePage/GenePage'
import Legend from '../Legend'
import {
  NO_HIGHLIGHTED_RESIDUES,
  PLDDT_BANDS,
  PlddtRunOnGenome,
  ResidueRange,
  plddtRunsOnGenome,
} from './missenseConstraint3d'

// Many runs are a few residues long, and borders would make them look black
const MIN_RUN_WIDTH_FOR_BORDER = 4

const PlddtRunTooltip = ({ region }: { region: RegionWithUnclamped<PlddtRunOnGenome> }) => (
  <RegionAttributeList>
    <div>
      <dt>Amino acids:</dt>
      <dd>
        {region.aa_start === region.aa_stop
          ? region.aa_start
          : `${region.aa_start}-${region.aa_stop}`}
      </dd>
    </div>
    <div>
      <dt>AlphaFold confidence:</dt>
      <dd>{region.band.label}</dd>
    </div>
    <div>
      <dt>pLDDT:</dt>
      <dd>
        {region.minPlddt === region.maxPlddt
          ? region.minPlddt.toFixed(1)
          : `${region.minPlddt.toFixed(1)}-${region.maxPlddt.toFixed(1)}`}
      </dd>
    </div>
  </RegionAttributeList>
)

type Props = {
  // From the loaded structure, indexed by residue number
  plddtByResidue: number[]
  chrom: string
  strand: Strand
  transcript: GeneTranscript
  onHighlightResidues: (residueRanges: ResidueRange[]) => void
}

// AlphaFold's confidence in the predicted position of each residue, along the gene
const PlddtTrack = ({ plddtByResidue, chrom, strand, transcript, onHighlightResidues }: Props) => {
  const runs = useMemo(
    () =>
      regionsInExons(
        plddtRunsOnGenome(plddtByResidue, { strand, exons: transcript.exons }, chrom),
        transcript.exons.filter((exon) => exon.feature_type === 'CDS')
      ),
    [plddtByResidue, chrom, strand, transcript]
  )

  return (
    <ConstraintTrack
      trackTitle="AlphaFold pLDDT"
      // An empty list, unlike null, draws neither region brackets nor a line through the track
      allRegions={[]}
      constrainedRegions={runs}
      infobuttonTopic="missense-constraint-3d"
      legend={<Legend series={PLDDT_BANDS.map(({ label, color }) => ({ label, color }))} />}
      tooltipComponent={PlddtRunTooltip}
      colorFn={(run: PlddtRunOnGenome) => run.band.color}
      valueFn={() => ''}
      minWidthForBorder={MIN_RUN_WIDTH_FOR_BORDER}
      onHoverRegion={(run) =>
        onHighlightResidues(run ? [[run.aa_start, run.aa_stop]] : NO_HIGHLIGHTED_RESIDUES)
      }
    />
  )
}

export default PlddtTrack
