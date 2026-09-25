import { describe, expect, test } from '@jest/globals'

import {
  RegionalMissenseConstraintRegion,
  missenseObsExpColorScale,
} from '../RegionalMissenseConstraintTrack'
import {
  CLINICAL_SIGNIFICANCE_CATEGORY_OVERLAYS,
  CONSEQUENCE_CATEGORY_OVERLAYS,
  GNOMAD_MISSENSE_OVERLAY,
  MissenseConstraint3dRegion,
  MissenseConstraint3dVariant,
  NO_REGION_COLOR,
  PLDDT_BANDS,
  RANKED_REGION_COLORS,
  codingSequenceLength,
  clinicalSignificanceCategoryOverlays,
  consequenceCategoryOverlays,
  formatResidue,
  isPassingGnomadMissenseVariant,
  obsExpBinColor,
  parseMissenseHgvsp,
  parseProteinChangeHgvsp,
  placeVariantsOnSequence,
  plddtColor,
  plddtResidueColors,
  rankConstrainedRegions,
  regionColor,
  regionalMissenseConstraintByResidue,
  regionsByResidue,
  residueColors,
  residueNamesMatchSequence,
  segmentsOnGenome,
  uniprotFeatureOverlays,
  uniprotFeaturesOnGenome,
  variantOverlay,
} from './missenseConstraint3d'

const region = (params: Partial<MissenseConstraint3dRegion>): MissenseConstraint3dRegion => ({
  region_index: 0,
  is_catch_all: false,
  obs_mis: 1,
  exp_mis: 10,
  obs_exp: 0.1,
  oe_upper: 0.3,
  p_value: 1e-6,
  segments: [],
  ...params,
})

const variant = (params: Partial<MissenseConstraint3dVariant>): MissenseConstraint3dVariant => ({
  variant_id: '1-100-A-G',
  consequence: 'missense_variant',
  hgvsp: 'p.Ala2Val',
  exome: { ac: 1, an: 100, filters: [] },
  genome: null,
  ...params,
})

// 4 residues encoded by two 6 base coding exons
const codingExons = [
  { feature_type: 'CDS', start: 100, stop: 105 },
  { feature_type: 'UTR', start: 90, stop: 99 },
  { feature_type: 'CDS', start: 200, stop: 205 },
]

describe('segmentsOnGenome', () => {
  const regions = [
    region({
      segments: [
        { aa_start: 1, aa_stop: 1 },
        { aa_start: 2, aa_stop: 3 },
      ],
    }),
  ]

  test('places residues on the + strand, across introns', () => {
    expect(
      segmentsOnGenome(regions, { strand: '+', exons: codingExons }, '1').map(
        ({ start, stop, aa_start: aaStart, aa_stop: aaStop }) => [aaStart, aaStop, start, stop]
      )
    ).toEqual([
      [1, 1, 100, 102],
      [2, 3, 103, 202],
    ])
  })

  test('numbers residues from the 3′ end of the - strand', () => {
    expect(
      segmentsOnGenome(regions, { strand: '-', exons: codingExons }, '1').map(({ start, stop }) => [
        start,
        stop,
      ])
    ).toEqual([
      [203, 205],
      [103, 202],
    ])
  })

  test('rejects residues past the coding sequence', () => {
    expect(() =>
      segmentsOnGenome(
        [region({ segments: [{ aa_start: 4, aa_stop: 5 }] })],
        { strand: '+', exons: codingExons },
        '1'
      )
    ).toThrow('Residues 4-5 are outside the coding sequence')
  })
})

test('UniProt features are placed on the genome like region segments', () => {
  expect(
    uniprotFeaturesOnGenome(
      [{ feature_type: 'transmembrane region', start: 2, stop: 3, note: 'Helical' }],
      { strand: '+', exons: codingExons },
      '1'
    ).map(({ start, stop, feature }) => [feature.start, feature.stop, start, stop])
  ).toEqual([[2, 3, 103, 202]])
})

test('codingSequenceLength counts only coding bases', () => {
  expect(codingSequenceLength(codingExons)).toBe(12)
})

describe('rankConstrainedRegions', () => {
  test('ranks significant, non catch-all regions by o/e', () => {
    const ranks = rankConstrainedRegions([
      region({ region_index: 0, obs_exp: 0.5 }),
      region({ region_index: 1, obs_exp: 0.2 }),
      region({ region_index: 2, obs_exp: 0.2 }),
      region({ region_index: 3, obs_exp: 0.1, p_value: 0.01 }),
      region({ region_index: 4, obs_exp: 0.05, is_catch_all: true }),
    ])
    expect(Array.from(ranks.entries())).toEqual([
      [1, 0],
      [2, 1],
      [0, 2],
    ])
  })

  test('ranks at most as many regions as there are colors', () => {
    const regions = Array.from({ length: 15 }, (_, index) =>
      region({ region_index: index, obs_exp: index / 20 })
    )
    expect(rankConstrainedRegions(regions).size).toBe(RANKED_REGION_COLORS.length)
  })
})

describe('regionColor', () => {
  const options = { colorCatchAllRegion: false, regionRanks: new Map([[1, 0]]) }

  test.each([
    [0, missenseObsExpColorScale.darkest],
    [0.2, missenseObsExpColorScale.darkest],
    [0.21, missenseObsExpColorScale.darker],
    [0.5, missenseObsExpColorScale.middle],
    [0.7, missenseObsExpColorScale.lighter],
    [1.3, missenseObsExpColorScale.lightest],
  ])('bins an o/e of %s', (obsExp, color) => {
    expect(obsExpBinColor(obsExp)).toBe(color)
  })

  test('colors by the o/e upper bound', () => {
    expect(
      regionColor(region({ obs_exp: 0.1, oe_upper: 0.9 }), { ...options, colorBy: 'oe_upper' })
    ).toBe(missenseObsExpColorScale.lightest)
  })

  test('grays out the catch-all region unless it is colored', () => {
    const catchAll = region({ is_catch_all: true })
    expect(regionColor(catchAll, { ...options, colorBy: 'obs_exp' })).toBe(NO_REGION_COLOR)
    expect(
      regionColor(catchAll, { ...options, colorBy: 'obs_exp', colorCatchAllRegion: true })
    ).toBe(missenseObsExpColorScale.darkest)
  })

  test('colors ranked regions by rank', () => {
    expect(
      regionColor(region({ region_index: 1 }), { ...options, colorBy: 'ranked_regions' })
    ).toBe(RANKED_REGION_COLORS[0])
    expect(
      regionColor(region({ region_index: 2 }), { ...options, colorBy: 'ranked_regions' })
    ).toBe(NO_REGION_COLOR)
  })
})

test('residue colors are indexed by residue number, counted from 1', () => {
  const constrained = region({ region_index: 0, segments: [{ aa_start: 1, aa_stop: 2 }] })
  const catchAll = region({
    region_index: 1,
    is_catch_all: true,
    segments: [{ aa_start: 4, aa_stop: 4 }],
  })
  const colors = residueColors(regionsByResidue([constrained, catchAll], 4), (r) =>
    r.is_catch_all ? 'catch-all' : 'constrained'
  )
  expect(colors).toEqual([
    NO_REGION_COLOR,
    'constrained',
    'constrained',
    NO_REGION_COLOR,
    'catch-all',
  ])
})

test('regional missense constraint regions are placed by their amino acids', () => {
  const rmcRegion = (aaStart: string | null, aaStop: string | null) =>
    ({ aa_start: aaStart, aa_stop: aaStop, obs_exp: 0.5 } as RegionalMissenseConstraintRegion)
  const minusStrandRegion = rmcRegion('Val4', 'Pro2')
  const byResidue = regionalMissenseConstraintByResidue(
    [minusStrandRegion, rmcRegion(null, null)],
    4
  )
  expect(Array.from(byResidue, (r) => r === minusStrandRegion)).toEqual([
    false,
    false,
    true,
    true,
    true,
  ])
})

describe('parseMissenseHgvsp', () => {
  test('parses a missense change', () => {
    expect(parseMissenseHgvsp('p.Gly826Glu')).toEqual({
      referenceAminoAcid: 'Gly',
      residueNumber: 826,
      alternateAminoAcid: 'Glu',
    })
  })

  test.each(['p.Leu123Leu', 'p.Leu123=', 'p.Arg12Ter', 'p.Ser32IlefsTer9', null])(
    'ignores %s',
    (hgvsp) => {
      expect(parseMissenseHgvsp(hgvsp)).toBeNull()
    }
  )
})

describe('placeVariantsOnSequence', () => {
  test('groups variants by residue and skips reference amino acid mismatches', () => {
    const variants = [
      variant({ variant_id: 'a', hgvsp: 'p.Ala2Val' }),
      variant({ variant_id: 'b', hgvsp: 'p.Ala2Thr' }),
      variant({ variant_id: 'c', hgvsp: 'p.Gly3Asp' }),
      variant({ variant_id: 'd', hgvsp: 'p.Gly2Asp' }),
    ]
    const { variantsByResidue, unplacedVariantCount } = placeVariantsOnSequence(variants, 'MAG')
    expect(
      Array.from(variantsByResidue.entries(), ([residue, residueVariants]) => [
        residue,
        residueVariants.map((v) => v.variant_id),
      ])
    ).toEqual([
      [2, ['a', 'b']],
      [3, ['c']],
    ])
    expect(unplacedVariantCount).toBe(1)
  })

  test('places no variants when positions are off by one', () => {
    const { variantsByResidue, unplacedVariantCount } = placeVariantsOnSequence(
      [variant({ hgvsp: 'p.Met2Val' }), variant({ hgvsp: 'p.Ala3Val' })],
      'MAG'
    )
    expect(variantsByResidue.size).toBe(0)
    expect(unplacedVariantCount).toBe(2)
  })

  test('counts overlay variants and residues', () => {
    const { variantsByResidue } = placeVariantsOnSequence(
      [variant({ hgvsp: 'p.Ala2Val' }), variant({ hgvsp: 'p.Ala2Thr' })],
      'MAG'
    )
    expect(variantOverlay(GNOMAD_MISSENSE_OVERLAY, variantsByResidue)).toEqual({
      ...GNOMAD_MISSENSE_OVERLAY,
      count: 2,
      residueRanges: [[2, 2]],
      style: 'variant',
    })
  })
})

describe('variant filters', () => {
  test('gnomAD missense variants must pass filters in the exomes or genomes', () => {
    expect(isPassingGnomadMissenseVariant(variant({}))).toBe(true)
    expect(
      isPassingGnomadMissenseVariant(variant({ exome: { ac: 1, an: 100, filters: ['AC0'] } }))
    ).toBe(false)
    expect(
      isPassingGnomadMissenseVariant(
        variant({
          exome: { ac: 1, an: 100, filters: ['AC0'] },
          genome: { ac: 1, an: 100, filters: [] },
        })
      )
    ).toBe(true)
    expect(isPassingGnomadMissenseVariant(variant({ consequence: 'synonymous_variant' }))).toBe(
      false
    )
  })
})

test('UniProt features are grouped into one overlay per known feature type', () => {
  const overlays = uniprotFeatureOverlays([
    { feature_type: 'transmembrane region', start: 5, stop: 20, note: 'Helical' },
    { feature_type: 'transmembrane region', start: 30, stop: 45, note: 'Helical' },
    { feature_type: 'disulfide bond', start: 8, stop: 8, note: null },
    { feature_type: 'sequence variant', start: 10, stop: 10, note: null },
  ])
  // Features of single residues are listed before regions
  expect(
    overlays.map(({ id, label, level, count, residueRanges }) => [
      id,
      label,
      level,
      count,
      residueRanges,
    ])
  ).toEqual([
    ['uniprot-disulfide-bond', 'Disulfide bond', 'residue', 1, [[8, 8]]],
    [
      'uniprot-transmembrane-region',
      'Transmembrane',
      'region',
      2,
      [
        [5, 20],
        [30, 45],
      ],
    ],
  ])
})

describe('parseProteinChangeHgvsp', () => {
  test.each([
    ['p.Arg540His', 'Arg', 540],
    ['p.Leu10=', 'Leu', 10],
    ['p.Arg100Ter', 'Arg', 100],
    ['p.Gly50AlafsTer10', 'Gly', 50],
    ['p.Lys5_Leu7del', 'Lys', 5],
  ])('finds the first residue changed by %s', (hgvsp, referenceAminoAcid, residueNumber) => {
    expect(parseProteinChangeHgvsp(hgvsp)).toEqual({ referenceAminoAcid, residueNumber })
  })

  test('finds no residue without a protein change', () => {
    expect(parseProteinChangeHgvsp(null)).toBeNull()
    expect(parseProteinChangeHgvsp('p.?')).toBeNull()
  })

  test('places variants of any consequence on the sequence', () => {
    const { variantsByResidue, unplacedVariantCount } = placeVariantsOnSequence(
      [
        variant({ hgvsp: 'p.Ala2=', consequence: 'synonymous_variant' }),
        variant({ hgvsp: 'p.Gly3Ter', consequence: 'stop_gained' }),
        variant({ hgvsp: null, consequence: 'intron_variant' }),
      ],
      'MAG',
      parseProteinChangeHgvsp
    )
    expect(Array.from(variantsByResidue.keys())).toEqual([2, 3])
    expect(unplacedVariantCount).toBe(1)
  })
})

test('variants are colored by their most severe consequence', () => {
  const overlays = consequenceCategoryOverlays(
    new Map([
      [1, [{ consequence: 'synonymous_variant' }, { consequence: 'stop_gained' }]],
      [2, [{ consequence: 'synonymous_variant' }]],
      [3, [{ consequence: 'missense_variant' }]],
    ])
  )
  expect(overlays.map(({ id, color, residueRanges }) => [id, color, residueRanges])).toEqual([
    ['gnomad-table-lof', CONSEQUENCE_CATEGORY_OVERLAYS[0].color, [[1, 1]]],
    ['gnomad-table-missense', CONSEQUENCE_CATEGORY_OVERLAYS[1].color, [[3, 3]]],
    ['gnomad-table-synonymous', CONSEQUENCE_CATEGORY_OVERLAYS[2].color, [[2, 2]]],
  ])
})

test('ClinVar variants are colored by their most pathogenic significance', () => {
  const clinvarVariant = (clinicalSignificance: string) => ({
    variant_id: '1-100-A-G',
    clinical_significance: clinicalSignificance,
    gold_stars: 2,
    major_consequence: 'missense_variant',
    hgvsp: 'p.Ala2Val',
  })
  const overlays = clinicalSignificanceCategoryOverlays(
    new Map([
      [1, [clinvarVariant('Benign'), clinvarVariant('Likely pathogenic')]],
      [2, [clinvarVariant('Uncertain significance'), clinvarVariant('Likely benign')]],
      [3, [clinvarVariant('Benign')]],
    ])
  )
  expect(overlays.map(({ id, color, residueRanges }) => [id, color, residueRanges])).toEqual([
    ['clinvar-track-pathogenic', CLINICAL_SIGNIFICANCE_CATEGORY_OVERLAYS[0].color, [[1, 1]]],
    ['clinvar-track-uncertain', CLINICAL_SIGNIFICANCE_CATEGORY_OVERLAYS[1].color, [[2, 2]]],
    ['clinvar-track-benign', CLINICAL_SIGNIFICANCE_CATEGORY_OVERLAYS[2].color, [[3, 3]]],
  ])
})

test('structure residues are checked against the protein sequence', () => {
  expect(
    residueNamesMatchSequence(
      [
        [1, 'MET'],
        [2, 'ALA'],
      ],
      'MA'
    )
  ).toBe(true)
  expect(
    residueNamesMatchSequence(
      [
        [1, 'MET'],
        [2, 'GLY'],
      ],
      'MA'
    )
  ).toBe(false)
  expect(residueNamesMatchSequence([[1, 'MET']], 'MA')).toBe(false)
})

test('formatResidue', () => {
  expect(formatResidue('GLY', 826)).toBe('Gly826')
})

describe('pLDDT colors', () => {
  const [veryHigh, confident, low, veryLow] = PLDDT_BANDS.map((band) => band.color)

  test.each([
    [95, veryHigh],
    [90, confident],
    [70.5, confident],
    [70, low],
    [50.5, low],
    [50, veryLow],
    [12, veryLow],
  ])('colors a pLDDT of %s with its AlphaFold DB band', (plddt, color) => {
    expect(plddtColor(plddt)).toBe(color)
  })

  test('are indexed by residue number, counted from 1', () => {
    const plddtByResidue: number[] = []
    plddtByResidue[1] = 95
    plddtByResidue[2] = 30
    expect(plddtResidueColors(plddtByResidue)).toEqual([NO_REGION_COLOR, veryHigh, veryLow])
  })
})
