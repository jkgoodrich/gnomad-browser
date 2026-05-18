import { Strand } from './GenePage'

export interface GenomicInterval {
  start: number
  stop: number
}

interface Exon {
  feature_type: string
  start: number
  stop: number
}

export type NmdRationale = 'multi-exon-50bp' | 'single-coding-exon' | 'no-cds'

export interface NmdRegionPrediction {
  nmdSensitiveRegions: GenomicInterval[]
  nmdEscapeRegions: GenomicInterval[]
  rationale: NmdRationale
}

const NMD_ESCAPE_DISTANCE_BP = 50

const exonLength = (exon: Exon): number => exon.stop - exon.start + 1

// Predict the NMD-sensitive and NMD-escape regions of a protein-coding transcript
// using the standard 50 bp rule. Returns intervals in genomic coordinates so they
// can be clipped to displayed exons by the caller (e.g. via regionsInExons()).
//
// Rule: a premature termination codon more than 50 bp upstream of the last
// exon-exon junction (measured in spliced mRNA / transcript coordinates) is
// predicted to trigger NMD. The "last exon-exon junction" refers to the splice
// site between the penultimate and last CDS-containing exons in transcript order.
// Single-coding-exon transcripts have no downstream junction, so the entire CDS
// is treated as NMD-escape.
export const predictNmdRegion = (transcript: {
  strand: Strand
  exons: Exon[]
}): NmdRegionPrediction => {
  const cdsExons = transcript.exons.filter((e) => e.feature_type === 'CDS')

  if (cdsExons.length === 0) {
    return { nmdSensitiveRegions: [], nmdEscapeRegions: [], rationale: 'no-cds' }
  }

  const orderedCds =
    transcript.strand === '+'
      ? [...cdsExons].sort((a, b) => a.start - b.start)
      : [...cdsExons].sort((a, b) => b.start - a.start)

  if (orderedCds.length === 1) {
    const exon = orderedCds[0]
    return {
      nmdSensitiveRegions: [],
      nmdEscapeRegions: [{ start: exon.start, stop: exon.stop }],
      rationale: 'single-coding-exon',
    }
  }

  const lastCds = orderedCds[orderedCds.length - 1]
  const nmdEscapeRegions: GenomicInterval[] = [{ start: lastCds.start, stop: lastCds.stop }]
  const nmdSensitiveRegions: GenomicInterval[] = []

  let bpRemaining = NMD_ESCAPE_DISTANCE_BP

  for (let i = orderedCds.length - 2; i >= 0; i -= 1) {
    const exon = orderedCds[i]
    const len = exonLength(exon)

    if (bpRemaining === 0) {
      nmdSensitiveRegions.push({ start: exon.start, stop: exon.stop })
      continue
    }

    if (len <= bpRemaining) {
      nmdEscapeRegions.push({ start: exon.start, stop: exon.stop })
      bpRemaining -= len
      continue
    }

    // Split this exon: the bpRemaining bases at its 3'-end (in transcript order)
    // are NMD-escape; the remainder is NMD-sensitive.
    if (transcript.strand === '+') {
      const splitPoint = exon.stop - bpRemaining + 1
      nmdEscapeRegions.push({ start: splitPoint, stop: exon.stop })
      nmdSensitiveRegions.push({ start: exon.start, stop: splitPoint - 1 })
    } else {
      const splitPoint = exon.start + bpRemaining - 1
      nmdEscapeRegions.push({ start: exon.start, stop: splitPoint })
      nmdSensitiveRegions.push({ start: splitPoint + 1, stop: exon.stop })
    }
    bpRemaining = 0
  }

  return { nmdSensitiveRegions, nmdEscapeRegions, rationale: 'multi-exon-50bp' }
}
