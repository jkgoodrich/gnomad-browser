import { describe, expect, test } from '@jest/globals'

import {
  RegionalMissenseConstraintRegion,
  missenseObsExpColorScale,
} from '../RegionalMissenseConstraintTrack'
import {
  CLINICAL_SIGNIFICANCE_CATEGORY_OVERLAYS,
  CONSEQUENCE_CATEGORY_OVERLAYS,
  MissenseConstraint3dRegion,
  MissenseConstraint3dVariant,
  NO_REGION_COLOR,
  PLDDT_BANDS,
  RANKED_REGION_COLORS,
  UNASSIGNED_RESIDUE_FILL,
  UNASSIGNED_RESIDUE_HATCH_COLOR,
  binByCount,
  codingSequenceLength,
  clinicalSignificanceCategoryOverlays,
  consequenceCategoryOverlays,
  fadeUnselectedResidues,
  formatResidue,
  obsExpBinColor,
  parseProteinChangeHgvsp,
  placeVariantsOnSequence,
  plddtColor,
  plddtResidueColors,
  plddtRunsOnGenome,
  rankConstrainedRegions,
  regionColor,
  regionalMissenseConstraintByResidue,
  regionalMissenseConstraintUpperRegionColor,
  regionsByResidue,
  residueColors,
  residueNamesMatchSequence,
  residuesOnGenome,
  segmentsOnGenome,
  toggleResidues,
  uniprotFeatureOverlays,
  uniprotFeaturesOnGenome,
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

describe('residuesOnGenome', () => {
  test('places the coding bases of residues, split at introns', () => {
    expect(residuesOnGenome(new Set([3, 1, 2]), { strand: '+', exons: codingExons })).toEqual([
      { start: 100, stop: 105 },
      { start: 200, stop: 202 },
    ])
  })

  test('numbers residues from the 3′ end of the - strand', () => {
    expect(residuesOnGenome([1], { strand: '-', exons: codingExons })).toEqual([
      { start: 203, stop: 205 },
    ])
  })
})

test('toggling residues adds them, or removes them if they are all selected', () => {
  expect(toggleResidues(null, [1, 2])).toEqual(new Set([1, 2]))
  expect(toggleResidues(new Set([1]), [1, 2])).toEqual(new Set([1, 2]))
  expect(toggleResidues(new Set([1, 2, 3]), [1, 2])).toEqual(new Set([3]))
  expect(toggleResidues(new Set([1]), [1])).toBeNull()
})

test('residues outside a selection are faded', () => {
  expect(fadeUnselectedResidues(['#000000', '#ff0000', '#000000'], new Set([1]))).toEqual([
    '#bfbfbf',
    '#ff0000',
    '#bfbfbf',
  ])
})

test('codingSequenceLength counts only coding bases', () => {
  expect(codingSequenceLength(codingExons)).toBe(12)
})

describe('binByCount', () => {
  test('bins counts from the smallest to the largest, including empty bins between them', () => {
    expect(binByCount([285, 11, 20, 19, 371], (count) => count)).toEqual([
      { label: '10-19', items: [11, 19] },
      { label: '20-49', items: [20] },
      { label: '50-99', items: [] },
      { label: '100-199', items: [] },
      { label: '200-499', items: [285, 371] },
    ])
  })

  test('bins of a single count are labeled by it, and the last bin has no end', () => {
    expect(binByCount([1, 5, 12000], (count) => count).map(({ label }) => label)).toEqual([
      '1',
      '2-4',
      '5-9',
      '10-19',
      '20-49',
      '50-99',
      '100-199',
      '200-499',
      '500-999',
      '1000-1999',
      '2000-4999',
      '5000-9999',
      '10000+',
    ])
  })

  test('bins items by their count', () => {
    const regions = [
      region({ region_index: 0, segments: [{ aa_start: 1, aa_stop: 1 }] }),
      region({
        region_index: 1,
        segments: [
          { aa_start: 2, aa_stop: 2 },
          { aa_start: 4, aa_stop: 4 },
        ],
      }),
    ]
    expect(binByCount(regions, (item) => item.segments.length)).toEqual([
      { label: '1', items: [regions[0]] },
      { label: '2-4', items: [regions[1]] },
    ])
    expect(binByCount([], (item) => item)).toEqual([])
  })
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
  const options = {
    colorCatchAllRegion: false,
    colorNonSignificantRegions: true,
    regionRanks: new Map([[1, 0]]),
  }

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

  test('hatches unassigned residues unless they are colored', () => {
    const catchAll = region({ is_catch_all: true, p_value: 0.5 })
    expect(regionColor(catchAll, { ...options, colorBy: 'obs_exp' })).toBe(UNASSIGNED_RESIDUE_FILL)
    expect(
      regionColor(catchAll, {
        ...options,
        colorBy: 'obs_exp',
        colorCatchAllRegion: true,
        colorNonSignificantRegions: false,
      })
    ).toBe(missenseObsExpColorScale.darkest)
    expect(
      regionColor(catchAll, { ...options, colorBy: 'ranked_regions', colorCatchAllRegion: true })
    ).toBe(UNASSIGNED_RESIDUE_FILL)
  })

  test('grays out regions that are not significant only when they are not colored', () => {
    const notSignificant = region({ p_value: 0.01 })
    expect(regionColor(notSignificant, { ...options, colorBy: 'obs_exp' })).toBe(
      missenseObsExpColorScale.darkest
    )
    const withoutNonSignificant = { ...options, colorNonSignificantRegions: false }
    expect(regionColor(notSignificant, { ...withoutNonSignificant, colorBy: 'oe_upper' })).toBe(
      NO_REGION_COLOR
    )
    expect(regionColor(region({}), { ...withoutNonSignificant, colorBy: 'obs_exp' })).toBe(
      missenseObsExpColorScale.darkest
    )
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

test('unassigned residues alternate between gray and the color of its hatching', () => {
  const catchAll = region({ is_catch_all: true, segments: [{ aa_start: 1, aa_stop: 3 }] })
  expect(residueColors(regionsByResidue([catchAll], 3), () => UNASSIGNED_RESIDUE_FILL)).toEqual([
    NO_REGION_COLOR,
    UNASSIGNED_RESIDUE_HATCH_COLOR,
    NO_REGION_COLOR,
    UNASSIGNED_RESIDUE_HATCH_COLOR,
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

describe('placeVariantsOnSequence', () => {
  test('groups variants by residue and skips reference amino acid mismatches', () => {
    const variants = [
      variant({ variant_id: 'a', hgvsp: 'p.Ala2Val' }),
      variant({ variant_id: 'b', hgvsp: 'p.Ala2Thr' }),
      variant({ variant_id: 'c', hgvsp: 'p.Gly3Asp' }),
      variant({ variant_id: 'd', hgvsp: 'p.Gly2Asp' }),
    ]
    expect(
      Array.from(placeVariantsOnSequence(variants, 'MAG'), ([residue, residueVariants]) => [
        residue,
        residueVariants.map((v) => v.variant_id),
      ])
    ).toEqual([
      [2, ['a', 'b']],
      [3, ['c']],
    ])
  })

  test('places no variants when positions are off by one', () => {
    expect(
      placeVariantsOnSequence(
        [variant({ hgvsp: 'p.Met2Val' }), variant({ hgvsp: 'p.Ala3Val' })],
        'MAG'
      ).size
    ).toBe(0)
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
    const variantsByResidue = placeVariantsOnSequence(
      [
        variant({ hgvsp: 'p.Ala2=', consequence: 'synonymous_variant' }),
        variant({ hgvsp: 'p.Gly3Ter', consequence: 'stop_gained' }),
        variant({ hgvsp: null, consequence: 'intron_variant' }),
      ],
      'MAG'
    )
    expect(Array.from(variantsByResidue.keys())).toEqual([2, 3])
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

test('regional missense constraint regions can be colored by their o/e upper bound', () => {
  const rmcRegion = (params: Partial<RegionalMissenseConstraintRegion>) =>
    ({
      obs_exp: 0.5,
      obs_exp_upper: 0.7,
      p_value: 1e-4,
      ...params,
    } as RegionalMissenseConstraintRegion)
  expect(regionalMissenseConstraintUpperRegionColor(rmcRegion({}))).toBe(
    missenseObsExpColorScale.lighter
  )
  // Like the regional missense constraint track, regions that aren't significant are gray
  expect(regionalMissenseConstraintUpperRegionColor(rmcRegion({ p_value: 0.5 }))).toBe(
    NO_REGION_COLOR
  )
  expect(regionalMissenseConstraintUpperRegionColor(rmcRegion({ obs_exp_upper: null }))).toBe(
    NO_REGION_COLOR
  )
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

  test('group consecutive residues in the same band, placed on the genome', () => {
    const plddtByResidue: number[] = []
    plddtByResidue[1] = 95
    plddtByResidue[2] = 92
    plddtByResidue[3] = 60
    plddtByResidue[4] = 61
    expect(
      plddtRunsOnGenome(plddtByResidue, { strand: '+', exons: codingExons }, '1').map(
        ({ start, stop, aa_start, aa_stop, band, minPlddt, maxPlddt }) => [
          start,
          stop,
          aa_start,
          aa_stop,
          band.color,
          minPlddt,
          maxPlddt,
        ]
      )
    ).toEqual([
      [100, 105, 1, 2, veryHigh, 92, 95],
      [200, 205, 3, 4, low, 60, 61],
    ])
  })
})
