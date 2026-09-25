import { advanceOverIntervals } from '../ClinvarVariantsTrack/ClinvarAllVariantsPlot'
import {
  CLINICAL_SIGNIFICANCE_CATEGORY_COLORS,
  clinvarVariantClinicalSignificanceCategory,
} from '../ClinvarVariantsTrack/clinvarVariantCategories'
import { Strand } from '../GenePage/GenePage'
import {
  RegionalMissenseConstraintRegion,
  missenseObsExpColorScale,
} from '../RegionalMissenseConstraintTrack'
import { VEP_CONSEQUENCE_CATEGORY_COLORS } from '../vepConsequences'

export type MissenseConstraint3dSegment = {
  aa_start: number
  aa_stop: number
}

export type MissenseConstraint3dRegion = {
  region_index: number
  is_catch_all: boolean
  obs_mis: number
  exp_mis: number
  obs_exp: number
  oe_upper: number
  p_value: number
  segments: MissenseConstraint3dSegment[]
}

export type UniprotFeature = {
  feature_type: string
  start: number
  stop: number
  note: string | null
}

export type MissenseConstraint3d = {
  transcript_id: string
  uniprot_id: string
  protein_sequence: string
  regions: MissenseConstraint3dRegion[]
  uniprot_features: UniprotFeature[]
}

type VariantDataset = {
  ac: number
  an: number
  filters: string[]
}

export type MissenseConstraint3dVariant = {
  variant_id: string
  consequence: string | null
  hgvsp: string | null
  exome: VariantDataset | null
  genome: VariantDataset | null
}

export type MissenseConstraint3dClinvarVariant = {
  variant_id: string
  clinical_significance: string
  gold_stars: number
  major_consequence: string | null
  hgvsp: string | null
}

// A region's segment placed on the genome, for display in the region viewer
export type MissenseConstraint3dTrackRegion = {
  chrom: string
  start: number
  stop: number
  aa_start: number
  aa_stop: number
  region: MissenseConstraint3dRegion
}

export type RegionColorBy = 'obs_exp' | 'oe_upper' | 'ranked_regions'

// The structure can also be colored by regional missense constraint (RMC) or AlphaFold confidence,
// neither of which is a property of 3D regions
export type StructureColorBy = RegionColorBy | 'regional_missense_constraint' | 'plddt'

// Inclusive range of residue numbers, counted from 1
export type ResidueRange = [number, number]

export type StructureOverlay = {
  id: string
  label: string
  color: string
  count: number
  residueRanges: ResidueRange[]
  style: 'variant' | 'feature'
}

export type HoveredResidue = {
  residueNumber: number
  residueName: string
  plddt: number
  // Cursor position relative to the viewer
  x: number
  y: number
}

export type StructureViewerProps = {
  structureUrl: string
  expectedSequence: string
  // Indexed by residue number
  residueColors: string[]
  highlightedResidueRanges: ResidueRange[]
  overlays: StructureOverlay[]
  resetViewCount: number
  onHoverResidue: (residue: HoveredResidue | null) => void
  // pLDDT of each residue in the loaded structure, indexed by residue number
  onLoadStructure: (plddtByResidue: number[]) => void
}

export type StructureViewerStatus =
  | 'loading'
  | 'ready'
  | 'webgl-unavailable'
  | 'load-error'
  | 'sequence-mismatch'

export const STRUCTURE_VIEWER_STATUS_MESSAGES: Record<
  Exclude<StructureViewerStatus, 'ready'>,
  string
> = {
  loading: 'Loading structure',
  'webgl-unavailable':
    'Showing the structure requires WebGL, which is not available in this browser.',
  'load-error': 'Unable to load the AlphaFold structure.',
  'sequence-mismatch':
    'The AlphaFold structure does not match the protein sequence used for 3D missense constraint.',
}

export const STRUCTURE_HIGHLIGHT_COLOR = '#ff00ff'

// AlphaFold considers residues below this pLDDT low confidence; the default view frames the rest
export const CONFIDENT_PLDDT = 70

// AlphaFold DB's confidence bands, labels and colors
export const PLDDT_BANDS = [
  { minimum: 90, label: 'Very high (pLDDT > 90)', color: '#0053d6' },
  { minimum: CONFIDENT_PLDDT, label: 'Confident (90 > pLDDT > 70)', color: '#65cbf3' },
  { minimum: 50, label: 'Low (70 > pLDDT > 50)', color: '#ffdb13' },
  { minimum: -Infinity, label: 'Very low (pLDDT < 50)', color: '#ff7d45' },
]

export const plddtColor = (plddt: number) => PLDDT_BANDS.find((band) => plddt > band.minimum)!.color

export const plddtResidueColors = (plddtByResidue: (number | undefined)[]) =>
  Array.from(plddtByResidue, (plddt) => (plddt === undefined ? NO_REGION_COLOR : plddtColor(plddt)))

export const ALPHAFOLD_DB_MODEL_VERSION = 6

export const alphafoldStructureUrl = (uniprotId: string) =>
  `https://alphafold.ebi.ac.uk/files/AF-${uniprotId}-F1-model_v${ALPHAFOLD_DB_MODEL_VERSION}.bcif`

export const alphafoldEntryUrl = (uniprotId: string) =>
  `https://alphafold.ebi.ac.uk/entry/${uniprotId}`

// Tableau 10
export const RANKED_REGION_COLORS = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#7f7f7f',
  '#bcbd22',
  '#17becf',
]

export const RANKED_REGION_MAX_P_VALUE = 1e-3

export const NO_REGION_COLOR = missenseObsExpColorScale.not_significant

export const UNIPROT_FEATURE_OVERLAY_STYLES: Record<string, { label: string; color: string }> = {
  'transmembrane region': { label: 'Transmembrane', color: '#ffa500' },
  'intramembrane region': { label: 'Intramembrane', color: '#00c8c8' },
  'topological domain': { label: 'Topological domain', color: '#4393c3' },
  domain: { label: 'Domain', color: '#a03cdc' },
  repeat: { label: 'Repeat', color: '#c2a5cf' },
  'zinc finger region': { label: 'Zinc finger', color: '#b450b4' },
  'DNA-binding region': { label: 'DNA binding', color: '#3c64f0' },
  'coiled-coil region': { label: 'Coiled coil', color: '#d2a08c' },
  'region of interest': { label: 'Region of interest', color: '#92c5de' },
  'short sequence motif': { label: 'Motif', color: '#a6611a' },
  'active site': { label: 'Active site', color: '#006d2c' },
  'binding site': { label: 'Binding site', color: '#32b432' },
  'metal ion-binding site': { label: 'Metal binding', color: '#f4a582' },
  site: { label: 'Site', color: '#e7298a' },
  'disulfide bond': { label: 'Disulfide bond', color: '#dcaa00' },
  'glycosylation site': { label: 'Glycosylation', color: '#7570b3' },
  'lipid moiety-binding region': { label: 'Lipidation', color: '#66a61e' },
  'signal peptide': { label: 'Signal peptide', color: '#1b7837' },
  propeptide: { label: 'Propeptide', color: '#7fbf7b' },
  'transit peptide': { label: 'Transit peptide', color: '#d95f02' },
}

const AMINO_ACID_CODES: Record<string, string> = {
  Ala: 'A',
  Arg: 'R',
  Asn: 'N',
  Asp: 'D',
  Cys: 'C',
  Gln: 'Q',
  Glu: 'E',
  Gly: 'G',
  His: 'H',
  Ile: 'I',
  Leu: 'L',
  Lys: 'K',
  Met: 'M',
  Phe: 'F',
  Pro: 'P',
  Ser: 'S',
  Thr: 'T',
  Trp: 'W',
  Tyr: 'Y',
  Val: 'V',
  Sec: 'U',
  Pyl: 'O',
}

const MISSENSE_CONSEQUENCE = 'missense_variant'

// Structures name residues in upper case (GLY); HGVS uses title case (Gly)
const titleCase = (residueName: string) =>
  `${residueName.charAt(0).toUpperCase()}${residueName.slice(1).toLowerCase()}`

export const formatResidue = (residueName: string, residueNumber: number) =>
  `${titleCase(residueName)}${residueNumber}`

export const residueNamesMatchSequence = (residues: [number, string][], sequence: string) =>
  residues.length === sequence.length &&
  residues.every(
    ([residueNumber, residueName]) =>
      AMINO_ACID_CODES[titleCase(residueName)] === sequence[residueNumber - 1]
  )

export const codingSequenceLength = (
  exons: { feature_type: string; start: number; stop: number }[]
) =>
  exons
    .filter((exon) => exon.feature_type === 'CDS')
    .reduce((length, exon) => length + exon.stop - exon.start + 1, 0)

export const segmentsOnGenome = (
  regions: MissenseConstraint3dRegion[],
  transcript: { strand: Strand; exons: { feature_type: string; start: number; stop: number }[] },
  chrom: string
): MissenseConstraint3dTrackRegion[] => {
  // Residues are numbered from the 5' end of the coding sequence
  const orderedCodingExons = transcript.exons
    .filter((exon) => exon.feature_type === 'CDS')
    .sort((a, b) => (transcript.strand === '+' ? a.start - b.start : b.start - a.start))

  return regions.flatMap((region) =>
    region.segments.map((segment) => {
      const firstBase = advanceOverIntervals(
        orderedCodingExons,
        segment.aa_start * 3 - 2,
        transcript.strand
      ).globalCoordinate
      const lastBase = advanceOverIntervals(
        orderedCodingExons,
        segment.aa_stop * 3,
        transcript.strand
      ).globalCoordinate
      if (firstBase === null || lastBase === null) {
        throw new Error(
          `Residues ${segment.aa_start}-${segment.aa_stop} are outside the coding sequence`
        )
      }
      return {
        chrom,
        start: Math.min(firstBase, lastBase),
        stop: Math.max(firstBase, lastBase),
        aa_start: segment.aa_start,
        aa_stop: segment.aa_stop,
        region,
      }
    })
  )
}

// Rank (from 0) of the most constrained significant regions, keyed by region index
export const rankConstrainedRegions = (regions: MissenseConstraint3dRegion[]) =>
  new Map(
    regions
      .filter((region) => !region.is_catch_all && region.p_value <= RANKED_REGION_MAX_P_VALUE)
      .sort((a, b) => a.obs_exp - b.obs_exp || a.region_index - b.region_index)
      .slice(0, RANKED_REGION_COLORS.length)
      .map((region, rank) => [region.region_index, rank])
  )

export const obsExpBinColor = (value: number) => {
  if (value > 0.8) {
    return missenseObsExpColorScale.lightest
  }
  if (value > 0.6) {
    return missenseObsExpColorScale.lighter
  }
  if (value > 0.4) {
    return missenseObsExpColorScale.middle
  }
  if (value > 0.2) {
    return missenseObsExpColorScale.darker
  }
  return missenseObsExpColorScale.darkest
}

export type RegionColorOptions = {
  colorBy: RegionColorBy
  colorCatchAllRegion: boolean
  regionRanks: Map<number, number>
}

export const regionColor = (
  region: MissenseConstraint3dRegion,
  { colorBy, colorCatchAllRegion, regionRanks }: RegionColorOptions
) => {
  if (colorBy === 'ranked_regions') {
    const rank = regionRanks.get(region.region_index)
    return rank === undefined ? NO_REGION_COLOR : RANKED_REGION_COLORS[rank]
  }
  if (region.is_catch_all && !colorCatchAllRegion) {
    return NO_REGION_COLOR
  }
  return obsExpBinColor(colorBy === 'obs_exp' ? region.obs_exp : region.oe_upper)
}

// Region containing each residue, indexed by residue number
const regionsAtResidues = <R>(regionRanges: [R, ResidueRange][], sequenceLength: number) => {
  const regionByResidue = new Array<R | undefined>(sequenceLength + 1)
  regionRanges.forEach(([region, [start, stop]]) => {
    regionByResidue.fill(region, start, stop + 1)
  })
  return regionByResidue
}

export const regionsByResidue = (regions: MissenseConstraint3dRegion[], sequenceLength: number) =>
  regionsAtResidues(
    regions.flatMap((region) =>
      region.segments.map((segment): [MissenseConstraint3dRegion, ResidueRange] => [
        region,
        [segment.aa_start, segment.aa_stop],
      ])
    ),
    sequenceLength
  )

// RMC regions give amino acids as residues ("Phe8"); on the minus strand they run from high to low
const residueNumber = (aminoAcid: string | null) => {
  const match = aminoAcid ? /(\d+)$/.exec(aminoAcid) : null
  return match ? Number(match[1]) : null
}

export const regionalMissenseConstraintByResidue = (
  regions: RegionalMissenseConstraintRegion[],
  sequenceLength: number
) =>
  regionsAtResidues(
    regions.flatMap((region): [RegionalMissenseConstraintRegion, ResidueRange][] => {
      const start = residueNumber(region.aa_start)
      const stop = residueNumber(region.aa_stop)
      return start === null || stop === null
        ? []
        : [[region, [Math.min(start, stop), Math.max(start, stop)]]]
    }),
    sequenceLength
  )

export const residueColors = <R extends object>(
  regionByResidue: (R | undefined)[],
  colorRegion: (region: R) => string
) => {
  const colorByRegion = new Map<R, string>()
  return Array.from(regionByResidue, (region) => {
    if (!region) {
      return NO_REGION_COLOR
    }
    if (!colorByRegion.has(region)) {
      colorByRegion.set(region, colorRegion(region))
    }
    return colorByRegion.get(region)!
  })
}

export const regionResidueRanges = (region: MissenseConstraint3dRegion): ResidueRange[] =>
  region.segments.map((segment) => [segment.aa_start, segment.aa_stop])

export const parseMissenseHgvsp = (hgvsp: string | null) => {
  const match = hgvsp ? /^p\.([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2})$/.exec(hgvsp) : null
  if (!match || match[1] === match[3] || match[3] === 'Ter') {
    return null
  }
  return {
    referenceAminoAcid: match[1],
    residueNumber: Number(match[2]),
    alternateAminoAcid: match[3],
  }
}

const passesFilters = (data: VariantDataset | null) => data !== null && data.filters.length === 0

export const isPassingGnomadMissenseVariant = (variant: MissenseConstraint3dVariant) =>
  variant.consequence === MISSENSE_CONSEQUENCE &&
  (passesFilters(variant.exome) || passesFilters(variant.genome))

export const isPathogenicClinvarMissenseVariant = (variant: MissenseConstraint3dClinvarVariant) =>
  variant.major_consequence === MISSENSE_CONSEQUENCE &&
  clinvarVariantClinicalSignificanceCategory(variant) === 'pathogenic'

// Variants whose HGVSp reference amino acid doesn't match the protein sequence can't be placed
export const placeVariantsOnSequence = <V extends { hgvsp: string | null }>(
  variants: V[],
  sequence: string
) => {
  const variantsByResidue = new Map<number, V[]>()
  let unplacedVariantCount = 0
  variants.forEach((variant) => {
    const change = parseMissenseHgvsp(variant.hgvsp)
    if (
      !change ||
      AMINO_ACID_CODES[change.referenceAminoAcid] !== sequence[change.residueNumber - 1]
    ) {
      unplacedVariantCount += 1
      return
    }
    variantsByResidue.set(change.residueNumber, [
      ...(variantsByResidue.get(change.residueNumber) || []),
      variant,
    ])
  })
  return { variantsByResidue, unplacedVariantCount }
}

export const variantOverlay = (
  { id, label, color }: { id: string; label: string; color: string },
  variantsByResidue: Map<number, unknown[]>
): StructureOverlay => ({
  id,
  label,
  color,
  count: Array.from(variantsByResidue.values()).reduce(
    (count, variants) => count + variants.length,
    0
  ),
  residueRanges: Array.from(
    variantsByResidue.keys(),
    (residue): ResidueRange => [residue, residue]
  ),
  style: 'variant',
})

export const GNOMAD_MISSENSE_OVERLAY = {
  id: 'gnomad-missense',
  label: 'gnomAD missense variants',
  color: VEP_CONSEQUENCE_CATEGORY_COLORS.missense,
}

export const CLINVAR_PATHOGENIC_MISSENSE_OVERLAY = {
  id: 'clinvar-pathogenic-missense',
  label: 'ClinVar pathogenic / likely pathogenic missense',
  color: CLINICAL_SIGNIFICANCE_CATEGORY_COLORS.pathogenic,
}

export const uniprotFeatureOverlays = (features: UniprotFeature[]): StructureOverlay[] =>
  Object.entries(UNIPROT_FEATURE_OVERLAY_STYLES).flatMap(([featureType, { label, color }]) => {
    const featuresOfType = features.filter((feature) => feature.feature_type === featureType)
    if (featuresOfType.length === 0) {
      return []
    }
    return [
      {
        id: `uniprot-${featureType}`,
        label,
        color,
        count: featuresOfType.length,
        residueRanges: featuresOfType.map((feature): ResidueRange => [feature.start, feature.stop]),
        style: 'feature',
      },
    ]
  })
