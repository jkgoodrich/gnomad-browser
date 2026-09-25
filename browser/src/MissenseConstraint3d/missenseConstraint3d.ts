import { advanceOverIntervals } from '../ClinvarVariantsTrack/ClinvarAllVariantsPlot'
import {
  CLINICAL_SIGNIFICANCE_CATEGORY_LABELS,
  clinvarVariantClinicalSignificanceCategory,
} from '../ClinvarVariantsTrack/clinvarVariantCategories'
import { Strand } from '../GenePage/GenePage'
import {
  RegionalMissenseConstraintRegion,
  missenseObsExpColorScale,
} from '../RegionalMissenseConstraintTrack'
import { VEP_CONSEQUENCE_CATEGORY_LABELS, getCategoryFromConsequence } from '../vepConsequences'

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

// A UniProt feature placed on the genome, for display in the region viewer
export type UniprotFeatureOnGenome = {
  chrom: string
  start: number
  stop: number
  feature: UniprotFeature
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
  // Opacity, from 0 to 1, of variant and feature overlays
  overlayOpacity: number
  // Scale of variant spheres and feature sticks, where 1 is their default size
  overlaySize: number
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

export const uniprotEntryUrl = (uniprotId: string) =>
  `https://www.uniprot.org/uniprotkb/${uniprotId}/entry`

export const uniprotHelpUrl = (uniprotHelpId: string) =>
  `https://www.uniprot.org/help/${uniprotHelpId}`

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

export type UniprotFeatureLevel = 'residue' | 'region'

// In the order that the structure's legend lists them
export const UNIPROT_FEATURE_LEVELS: { level: UniprotFeatureLevel; label: string }[] = [
  { level: 'residue', label: 'Residues' },
  { level: 'region', label: 'Regions' },
]

// Overlays use cool colors that stand out against the warm missense o/e colors, but not the magenta
// that highlights residues. UniProt features are grouped into color families: sites in greens,
// modifications in teals, topology in blues, domains and regions in purples and processing in grays.
// Features are listed in this order. Descriptions are adapted from UniProt's documentation of each
// feature type, at https://www.uniprot.org/help/<uniprotHelpId>.
export const UNIPROT_FEATURE_OVERLAY_STYLES: Record<
  string,
  {
    label: string
    color: string
    level: UniprotFeatureLevel
    uniprotHelpId: string
    description: string
  }
> = {
  'active site': {
    label: 'Active site',
    color: '#a1d99b',
    level: 'residue',
    uniprotHelpId: 'act_site',
    description: 'Residues directly involved in catalysis by an enzyme.',
  },
  'binding site': {
    label: 'Binding site',
    color: '#238b45',
    level: 'residue',
    uniprotHelpId: 'binding',
    description:
      'Residues that interact with a chemical entity, such as a metal, cofactor, substrate or other ligand.',
  },
  'metal ion-binding site': {
    label: 'Metal binding',
    color: '#74c476',
    level: 'residue',
    uniprotHelpId: 'metal',
    description:
      'Residues that bind a metal ion. UniProt has since merged these into binding sites.',
  },
  site: {
    label: 'Site',
    color: '#00441b',
    level: 'residue',
    uniprotHelpId: 'site',
    description: 'Single residues of interest that no other feature type describes.',
  },
  'disulfide bond': {
    label: 'Disulfide bond',
    color: '#01665e',
    level: 'residue',
    uniprotHelpId: 'disulfid',
    description: 'Cysteine residues that participate in disulfide bonds.',
  },
  'glycosylation site': {
    label: 'Glycosylation',
    color: '#35978f',
    level: 'residue',
    uniprotHelpId: 'carbohyd',
    description: 'Residues with a covalently attached glycan group (mono-, di- or polysaccharide).',
  },
  'lipid moiety-binding region': {
    label: 'Lipidation',
    color: '#80cdc1',
    level: 'residue',
    uniprotHelpId: 'lipid',
    description: 'Residues with a covalently attached lipid group.',
  },
  'transmembrane region': {
    label: 'Transmembrane',
    color: '#08519c',
    level: 'region',
    uniprotHelpId: 'transmem',
    description: 'Membrane-spanning regions, both alpha-helical and those of beta-barrel proteins.',
  },
  'intramembrane region': {
    label: 'Intramembrane',
    color: '#4292c6',
    level: 'region',
    uniprotHelpId: 'intramem',
    description: "Regions buried within a membrane that don't cross it.",
  },
  'topological domain': {
    label: 'Topological domain',
    color: '#9ecae1',
    level: 'region',
    uniprotHelpId: 'topo_dom',
    description:
      'The subcellular compartment where each region of a membrane-spanning protein outside the membrane is found.',
  },
  domain: {
    label: 'Domain',
    color: '#3f007d',
    level: 'region',
    uniprotHelpId: 'domain',
    description:
      'Specific combinations of secondary structures organized into a characteristic three-dimensional structure or fold.',
  },
  repeat: {
    label: 'Repeat',
    color: '#54278f',
    level: 'region',
    uniprotHelpId: 'repeat',
    description: 'Repeated sequence motifs or repeated domains.',
  },
  'zinc finger region': {
    label: 'Zinc finger',
    color: '#807dba',
    level: 'region',
    uniprotHelpId: 'zn_fing',
    description: 'Zinc fingers, with their types.',
  },
  'DNA-binding region': {
    label: 'DNA binding',
    color: '#9e9ac8',
    level: 'region',
    uniprotHelpId: 'dna_bind',
    description: 'DNA-binding domains, with their types.',
  },
  'coiled-coil region': {
    label: 'Coiled coil',
    color: '#756bb1',
    level: 'region',
    uniprotHelpId: 'coiled',
    description: 'Regions of coiled coil.',
  },
  'region of interest': {
    label: 'Region of interest',
    color: '#6a51a3',
    level: 'region',
    uniprotHelpId: 'region',
    description: 'Regions of interest that no other feature type describes.',
  },
  'short sequence motif': {
    label: 'Motif',
    color: '#bcbddc',
    level: 'region',
    uniprotHelpId: 'motif',
    description:
      'Short (usually no more than 20 amino acids) conserved sequence motifs of biological significance.',
  },
  'signal peptide': {
    label: 'Signal peptide',
    color: '#252525',
    level: 'region',
    uniprotHelpId: 'signal',
    description: 'An N-terminal signal peptide.',
  },
  propeptide: {
    label: 'Propeptide',
    color: '#636363',
    level: 'region',
    uniprotHelpId: 'propep',
    description:
      'Parts of a protein that are cleaved during maturation or activation, and generally have no function of their own once cleaved.',
  },
  'transit peptide': {
    label: 'Transit peptide',
    color: '#969696',
    level: 'region',
    uniprotHelpId: 'transit',
    description: 'The extent of a transit peptide.',
  },
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

type TranscriptOnGenome = {
  strand: Strand
  exons: { feature_type: string; start: number; stop: number }[]
}

// Places ranges of residues on the genome. Residues are numbered from the 5' end of the coding sequence
const residueRangesOnGenome = ({ strand, exons }: TranscriptOnGenome) => {
  const orderedCodingExons = exons
    .filter((exon) => exon.feature_type === 'CDS')
    .sort((a, b) => (strand === '+' ? a.start - b.start : b.start - a.start))

  return ([aaStart, aaStop]: ResidueRange) => {
    const firstBase = advanceOverIntervals(
      orderedCodingExons,
      aaStart * 3 - 2,
      strand
    ).globalCoordinate
    const lastBase = advanceOverIntervals(orderedCodingExons, aaStop * 3, strand).globalCoordinate
    if (firstBase === null || lastBase === null) {
      throw new Error(`Residues ${aaStart}-${aaStop} are outside the coding sequence`)
    }
    return { start: Math.min(firstBase, lastBase), stop: Math.max(firstBase, lastBase) }
  }
}

export const segmentsOnGenome = (
  regions: MissenseConstraint3dRegion[],
  transcript: TranscriptOnGenome,
  chrom: string
): MissenseConstraint3dTrackRegion[] => {
  const onGenome = residueRangesOnGenome(transcript)
  return regions.flatMap((region) =>
    region.segments.map((segment) => ({
      chrom,
      ...onGenome([segment.aa_start, segment.aa_stop]),
      aa_start: segment.aa_start,
      aa_stop: segment.aa_stop,
      region,
    }))
  )
}

export const uniprotFeaturesOnGenome = (
  features: UniprotFeature[],
  transcript: TranscriptOnGenome,
  chrom: string
): UniprotFeatureOnGenome[] => {
  const onGenome = residueRangesOnGenome(transcript)
  return features.map((feature) => ({
    chrom,
    ...onGenome([feature.start, feature.stop]),
    feature,
  }))
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

// The first residue changed by any protein change, like p.Arg540His, p.Leu10=, p.Gly50AlafsTer10 or
// p.Lys5_Leu7del
export const parseProteinChangeHgvsp = (hgvsp: string | null) => {
  const match = hgvsp ? /^p\.([A-Z][a-z]{2})(\d+)/.exec(hgvsp) : null
  return match ? { referenceAminoAcid: match[1], residueNumber: Number(match[2]) } : null
}

// Variants whose HGVSp reference amino acid doesn't match the protein sequence can't be placed
export const placeVariantsOnSequence = <V extends { hgvsp: string | null }>(
  variants: V[],
  sequence: string,
  parseHgvsp: (
    hgvsp: string | null
  ) => { referenceAminoAcid: string; residueNumber: number } | null = parseMissenseHgvsp
) => {
  const variantsByResidue = new Map<number, V[]>()
  let unplacedVariantCount = 0
  variants.forEach((variant) => {
    const change = parseHgvsp(variant.hgvsp)
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

// Unlike the browser's usual variant colors, overlay colors don't blend into the missense o/e colors
export const GNOMAD_MISSENSE_OVERLAY = {
  id: 'gnomad-missense',
  label: 'gnomAD',
  color: '#2166ac',
}

type OverlayCategory = { id: string; label: string; color: string }

// One overlay per category. Residues with variants in several categories take the first of those
// categories.
const categoryOverlays = <V>(
  overlayId: string,
  categories: OverlayCategory[],
  categoryOf: (variant: V) => string,
  variantsByResidue: Map<number, V[]>
): StructureOverlay[] => {
  const residuesByCategory = new Map<string, number[]>()
  variantsByResidue.forEach((variants, residue) => {
    const variantCategories = new Set(variants.map(categoryOf))
    const category = categories.find(({ id }) => variantCategories.has(id))
    if (category) {
      residuesByCategory.set(category.id, [...(residuesByCategory.get(category.id) || []), residue])
    }
  })
  return categories.flatMap(({ id, label, color }) => {
    const residues = residuesByCategory.get(id)
    return residues
      ? [
          {
            id: `${overlayId}-${id}`,
            label,
            color,
            count: residues.length,
            residueRanges: residues.map((residue): ResidueRange => [residue, residue]),
            style: 'variant' as const,
          },
        ]
      : []
  })
}

// The variants listed in the gnomAD variants table, colored by their most severe consequence
export const TABLE_VARIANTS_OVERLAY_ID = 'gnomad-table'

export const CONSEQUENCE_CATEGORY_OVERLAYS: OverlayCategory[] = [
  { id: 'lof', label: VEP_CONSEQUENCE_CATEGORY_LABELS.lof, color: '#000000' },
  {
    id: 'missense',
    label: VEP_CONSEQUENCE_CATEGORY_LABELS.missense,
    color: GNOMAD_MISSENSE_OVERLAY.color,
  },
  { id: 'synonymous', label: VEP_CONSEQUENCE_CATEGORY_LABELS.synonymous, color: '#1b7837' },
  { id: 'other', label: VEP_CONSEQUENCE_CATEGORY_LABELS.other, color: '#878787' },
]

export const consequenceCategoryOverlays = (
  variantsByResidue: Map<number, { consequence: string | null }[]>
) =>
  categoryOverlays(
    TABLE_VARIANTS_OVERLAY_ID,
    CONSEQUENCE_CATEGORY_OVERLAYS,
    (variant) => getCategoryFromConsequence(variant.consequence) || 'other',
    variantsByResidue
  )

// The variants listed in the ClinVar track, colored by their clinical significance, from pathogenic
// to benign
export const CLINVAR_TRACK_VARIANTS_OVERLAY_ID = 'clinvar-track'

export const CLINICAL_SIGNIFICANCE_CATEGORY_OVERLAYS: OverlayCategory[] = [
  {
    id: 'pathogenic',
    label: CLINICAL_SIGNIFICANCE_CATEGORY_LABELS.pathogenic,
    color: '#762a83',
  },
  { id: 'uncertain', label: CLINICAL_SIGNIFICANCE_CATEGORY_LABELS.uncertain, color: '#c2a5cf' },
  { id: 'benign', label: CLINICAL_SIGNIFICANCE_CATEGORY_LABELS.benign, color: '#5aae61' },
  { id: 'other', label: CLINICAL_SIGNIFICANCE_CATEGORY_LABELS.other, color: '#bababa' },
]

export const clinicalSignificanceCategoryOverlays = (
  variantsByResidue: Map<number, MissenseConstraint3dClinvarVariant[]>
) =>
  categoryOverlays(
    CLINVAR_TRACK_VARIANTS_OVERLAY_ID,
    CLINICAL_SIGNIFICANCE_CATEGORY_OVERLAYS,
    clinvarVariantClinicalSignificanceCategory,
    variantsByResidue
  )

// Element ids can't contain spaces
export const uniprotFeatureOverlayId = (featureType: string) =>
  `uniprot-${featureType.replace(/ /g, '-')}`

// UniProt features grouped by type, in the order of UNIPROT_FEATURE_OVERLAY_STYLES
export const uniprotFeaturesByType = (features: UniprotFeature[]) =>
  Object.entries(UNIPROT_FEATURE_OVERLAY_STYLES).flatMap(([featureType, style]) => {
    const featuresOfType = features.filter((feature) => feature.feature_type === featureType)
    return featuresOfType.length === 0
      ? []
      : [{ id: uniprotFeatureOverlayId(featureType), ...style, features: featuresOfType }]
  })

export const uniprotFeatureOverlays = (
  features: UniprotFeature[]
): (StructureOverlay & { level: UniprotFeatureLevel })[] =>
  uniprotFeaturesByType(features).map(({ id, label, color, level, features: featuresOfType }) => ({
    id,
    label,
    color,
    level,
    count: featuresOfType.length,
    residueRanges: featuresOfType.map((feature): ResidueRange => [feature.start, feature.stop]),
    style: 'feature',
  }))
