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

// Why a region is predicted to escape NMD. Mirrors the four categories used by
// the UCSC "NMD escape" track (genome.ucsc.edu .../nmdEscNcbiRefSeq).
export type NmdEscapeReason =
  | 'last-junction-50bp'
  | 'start-proximal'
  | 'long-exon'
  | 'single-coding-exon'

export interface NmdEscapeInterval extends GenomicInterval {
  reason: NmdEscapeReason
}

// Shared human-readable text for each escape reason, used by both the gene-page
// track and the variant-table flag so they stay in sync.
export const NMD_ESCAPE_REASON_INFO: Record<
  NmdEscapeReason,
  { label: string; description: string }
> = {
  'last-junction-50bp': {
    label: 'Last exon / 50 bp rule',
    description:
      'In the final coding exon, or within 50 bp upstream of the last exon-exon junction. No downstream junction complex remains to trigger NMD.',
  },
  'start-proximal': {
    label: 'Start-proximal',
    description:
      'Within the first 100 bp of the coding sequence. Premature termination codons here can be rescued by translation re-initiation at a downstream start codon.',
  },
  'long-exon': {
    label: 'Long exon (>400 bp)',
    description:
      'In an internal coding exon longer than 400 bp. The increased distance to the downstream junction complex reduces NMD efficiency.',
  },
  'single-coding-exon': {
    label: 'No downstream EJC',
    description:
      'Single-coding-exon transcript with no downstream exon-exon junction, so no junction complex is deposited to trigger NMD.',
  },
}

export interface NmdRegionPrediction {
  nmdSensitiveRegions: GenomicInterval[]
  nmdEscapeRegions: NmdEscapeInterval[]
  rationale: NmdRationale
}

const NMD_ESCAPE_DISTANCE_BP = 50
const START_PROXIMAL_ESCAPE_BP = 100
const LONG_EXON_BP = 400

const exonLength = (exon: Exon): number => exon.stop - exon.start + 1

// Walk `bp` bases from the 5' end of the CDS in transcript order, possibly
// spanning multiple exons if exon 1 is shorter than `bp`.
const walkFromStart = (orderedCds: Exon[], bp: number, strand: Strand): GenomicInterval[] => {
  const intervals: GenomicInterval[] = []
  let remaining = bp
  for (const exon of orderedCds) {
    if (remaining === 0) break
    const len = exonLength(exon)
    if (len <= remaining) {
      intervals.push({ start: exon.start, stop: exon.stop })
      remaining -= len
    } else {
      if (strand === '+') {
        intervals.push({ start: exon.start, stop: exon.start + remaining - 1 })
      } else {
        intervals.push({ start: exon.stop - remaining + 1, stop: exon.stop })
      }
      remaining = 0
    }
  }
  return intervals
}

// Walk `bp` bases backward from the 3' end of an exon list (in transcript order),
// possibly spanning multiple exons if the last exon in the list is shorter than `bp`.
// Used to absorb the 50 bp upstream of the last exon-exon junction.
const walkFromEnd = (exons: Exon[], bp: number, strand: Strand): GenomicInterval[] => {
  const intervals: GenomicInterval[] = []
  let remaining = bp
  for (let i = exons.length - 1; i >= 0; i -= 1) {
    if (remaining === 0) break
    const exon = exons[i]
    const len = exonLength(exon)
    if (len <= remaining) {
      intervals.push({ start: exon.start, stop: exon.stop })
      remaining -= len
    } else {
      if (strand === '+') {
        intervals.push({ start: exon.stop - remaining + 1, stop: exon.stop })
      } else {
        intervals.push({ start: exon.start, stop: exon.start + remaining - 1 })
      }
      remaining = 0
    }
  }
  return intervals
}

// Subtract `minus` intervals from each interval in `base`, splitting where needed.
const subtractIntervals = (
  base: GenomicInterval[],
  minus: GenomicInterval[]
): GenomicInterval[] => {
  let result = [...base]
  for (const m of minus) {
    const next: GenomicInterval[] = []
    for (const b of result) {
      if (m.stop < b.start || m.start > b.stop) {
        next.push(b)
        continue
      }
      if (m.start <= b.start && m.stop >= b.stop) continue
      if (m.start > b.start) next.push({ start: b.start, stop: m.start - 1 })
      if (m.stop < b.stop) next.push({ start: m.stop + 1, stop: b.stop })
    }
    result = next
  }
  return result.filter((r) => r.start <= r.stop)
}

// Predict the NMD-sensitive and NMD-escape regions of a protein-coding transcript.
// Returns intervals in genomic coordinates so they can be clipped to displayed
// exons by the caller (e.g. via regionsInExons()).
//
// Each escape interval is tagged with the reason it escapes. When rules overlap,
// the higher-priority reason wins so the returned escape intervals never overlap:
//   1. last-junction-50bp — the entire final CDS exon (everything downstream of
//      the last junction) plus the 50 bp immediately upstream of that junction
//      (measured in spliced mRNA / transcript coordinates).
//   2. start-proximal — the first 100 bp of the CDS (transcript order).
//   3. long-exon — any internal CDS exon longer than 400 bp (the final exon is
//      excluded, as it is already covered by rule 1).
//
// Single-coding-exon transcripts have no downstream junction, so the entire CDS
// is treated as NMD-escape (reason 'single-coding-exon'). Transcripts without a
// CDS produce no intervals.
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
      nmdEscapeRegions: [{ start: exon.start, stop: exon.stop, reason: 'single-coding-exon' }],
      rationale: 'single-coding-exon',
    }
  }

  const lastCds = orderedCds[orderedCds.length - 1]
  const upstream = orderedCds.slice(0, -1)

  // Candidate intervals per escape reason, in descending priority order. Where
  // two reasons cover the same base the earlier (higher-priority) one wins.
  const candidatesByReason: { reason: NmdEscapeReason; intervals: GenomicInterval[] }[] = [
    {
      reason: 'last-junction-50bp',
      intervals: [
        { start: lastCds.start, stop: lastCds.stop },
        ...walkFromEnd(upstream, NMD_ESCAPE_DISTANCE_BP, transcript.strand),
      ],
    },
    {
      reason: 'start-proximal',
      intervals: walkFromStart(orderedCds, START_PROXIMAL_ESCAPE_BP, transcript.strand),
    },
    {
      reason: 'long-exon',
      intervals: upstream
        .filter((e) => exonLength(e) > LONG_EXON_BP)
        .map((e) => ({ start: e.start, stop: e.stop })),
    },
  ]

  const escapeIntervals: NmdEscapeInterval[] = []
  const claimed: GenomicInterval[] = []
  candidatesByReason.forEach(({ reason, intervals }) => {
    subtractIntervals(intervals, claimed).forEach((interval) => {
      escapeIntervals.push({ ...interval, reason })
      claimed.push(interval)
    })
  })

  const cdsAscending = [...cdsExons]
    .sort((a, b) => a.start - b.start)
    .map((e) => ({ start: e.start, stop: e.stop }))
  const sensitiveIntervals = subtractIntervals(cdsAscending, claimed)

  return {
    nmdSensitiveRegions: sensitiveIntervals,
    nmdEscapeRegions: escapeIntervals,
    rationale: 'multi-exon-50bp',
  }
}

// VEP consequences that introduce a premature termination codon at the variant's
// own locus, so the NMD outcome can be determined from the variant position.
// Splice loss-of-function is excluded because its PTC location depends on the
// altered transcript, not the variant position.
export const NMD_PTC_CONSEQUENCES = new Set(['stop_gained', 'frameshift_variant'])

// Return the NMD-escape reason for a single genomic position in a transcript, or
// null if a premature termination codon there is predicted to be NMD-sensitive.
export const nmdEscapeReasonAtPosition = (
  transcript: { strand: Strand; exons: Exon[] },
  pos: number
): NmdEscapeReason | null => {
  const { nmdEscapeRegions } = predictNmdRegion(transcript)
  const hit = nmdEscapeRegions.find((r) => pos >= r.start && pos <= r.stop)
  return hit ? hit.reason : null
}
