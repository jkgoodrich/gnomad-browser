import React, { useState } from 'react'
import renderer from 'react-test-renderer'
import { jest, describe, expect, test, beforeEach, afterEach } from '@jest/globals'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { RegionViewerContext, regionViewerScale } from '@gnomad/region-viewer'

import { mockQueries } from '../../../tests/__helpers__/queries'
import Query, { BaseQuery } from '../Query'
import { logButtonClick } from '../analytics'
import geneFactory from '../__factories__/Gene'
import { Gene } from '../GenePage/GenePage'
import {
  ClinvarTrackFilter,
  DEFAULT_CLINVAR_TRACK_FILTER,
} from '../ClinvarVariantsTrack/ClinvarVariantTrack'
import {
  RegionalMissenseConstraint,
  missenseObsExpColorScale,
} from '../RegionalMissenseConstraintTrack'
import { DEFAULT_VARIANT_FILTER, VariantFilterState } from '../VariantList/filterVariants'
import MissenseConstraint3dTrack from './MissenseConstraint3dTrack'
import {
  MISSENSE_CONSTRAINT_3D_COLOR,
  MissenseConstraintPlotToggle,
  REGIONAL_MISSENSE_CONSTRAINT_COLOR,
} from './MissenseConstraintPlotTrack'
import {
  MissenseConstraint3d,
  NO_REGION_COLOR,
  PageFilter,
  PLDDT_BANDS,
  STRUCTURE_HIGHLIGHT_COLOR,
  StructureSelection,
  StructureViewerHandle,
  StructureViewerProps,
  UNASSIGNED_RESIDUE_FILL,
  UNASSIGNED_RESIDUE_HATCH_COLOR,
  UNASSIGNED_RESIDUE_PATTERN_ID,
  UNIPROT_FEATURE_OVERLAY_STYLES,
  alphafoldStructureUrl,
  uniprotEntryUrl,
} from './missenseConstraint3d'
import StructureViewer3Dmol from './StructureViewer3Dmol'
import StructureViewerMolstar from './StructureViewerMolstar'

jest.mock('../Query', () => {
  const originalModule = jest.requireActual('../Query')

  return {
    __esModule: true,
    ...(originalModule as object),
    default: jest.fn(),
    BaseQuery: jest.fn(),
  }
})

jest.mock('../analytics', () => ({ logButtonClick: jest.fn() }))

// jsdom has no WebGL, so the viewers are replaced by components that record their props, and whose
// boxes always hold residues 1 and 2
// A declaration, so that it exists when the mocked modules are first imported
function mockStructureViewer() {
  const { forwardRef, useImperativeHandle } = jest.requireActual<typeof React>('react')
  const handle: StructureViewerHandle = { residuesInRectangle: () => [1, 2], zoomBy: jest.fn() }
  const renderViewer = jest.fn(
    (_props: StructureViewerProps, ref: React.ForwardedRef<StructureViewerHandle>) => {
      useImperativeHandle(ref, () => handle)
      return null
    }
  )
  // forwardRef exposes renderViewer as the component's render property
  return { __esModule: true, default: forwardRef(renderViewer), handle }
}
jest.mock('./StructureViewer3Dmol', () => mockStructureViewer())
jest.mock('./StructureViewerMolstar', () => mockStructureViewer())

// jsdom has neither pointer events nor pointer capture
class MockPointerEvent extends MouseEvent {
  pointerId: number

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
  }
}
window.PointerEvent = MockPointerEvent as typeof PointerEvent
HTMLElement.prototype.setPointerCapture = () => {}

const {
  resetMockApiCalls,
  resetMockApiResponses,
  simulateApiResponse,
  setMockApiResponses,
  mockApiCalls,
} = mockQueries()

beforeEach(() => {
  Query.mockImplementation(
    jest.fn(({ children, operationName, variables, query }) =>
      simulateApiResponse('Query', query, children, operationName, variables)
    )
  )
  ;(BaseQuery as any).mockImplementation(
    jest.fn(({ children, operationName, variables, query }) =>
      simulateApiResponse('BaseQuery', query, children, operationName, variables)
    )
  )
})

afterEach(() => {
  resetMockApiCalls()
  resetMockApiResponses()
  jest.clearAllMocks()
})

const TRANSCRIPT_ID = 'ENST00000000001'

// A 4 residue protein encoded by two 6 base coding exons
const codingExons = [
  { feature_type: 'CDS', start: 100, stop: 105 },
  { feature_type: 'CDS', start: 200, stop: 205 },
]

const gene: Gene = {
  ...geneFactory.build({ gene_id: 'ENSG00000000001', chrom: '12', strand: '+' }),
  exons: codingExons,
  transcripts: [
    {
      transcript_id: TRANSCRIPT_ID,
      transcript_version: '1',
      exons: codingExons,
      gtex_tissue_expression: null,
    },
  ],
}

const missenseConstraint3d: MissenseConstraint3d = {
  transcript_id: TRANSCRIPT_ID,
  uniprot_id: 'P00001',
  protein_sequence: 'MAGK',
  regions: [
    {
      region_index: 0,
      is_catch_all: false,
      obs_mis: 1,
      exp_mis: 20,
      obs_exp: 0.05,
      oe_upper: 0.3,
      p_value: 1e-8,
      segments: [{ aa_start: 1, aa_stop: 2 }],
    },
    {
      region_index: 1,
      is_catch_all: true,
      obs_mis: 9,
      exp_mis: 10,
      obs_exp: 0.9,
      oe_upper: 1.1,
      p_value: 0.5,
      segments: [{ aa_start: 3, aa_stop: 4 }],
    },
  ],
  uniprot_features: [{ feature_type: 'transmembrane region', start: 2, stop: 3, note: 'Helical' }],
}

const variantsResponse = {
  transcript: {
    variants: [
      {
        variant_id: '12-103-C-T',
        consequence: 'missense_variant',
        hgvsp: 'p.Ala2Val',
      },
      {
        variant_id: '12-201-G-A',
        consequence: 'missense_variant',
        hgvsp: 'p.Gly2Asp',
      },
    ],
    clinvar_variants: [
      {
        variant_id: '12-104-A-G',
        clinical_significance: 'Pathogenic',
        gold_stars: 2,
        major_consequence: 'missense_variant',
        hgvsp: 'p.Gly3Asp',
      },
    ],
  },
}

const regionalMissenseConstraint: RegionalMissenseConstraint = {
  has_no_rmc_evidence: false,
  passed_qc: true,
  regions: [
    {
      chrom: '12',
      start: 100,
      stop: 205,
      aa_start: 'Met1',
      aa_stop: 'Lys4',
      obs_mis: 5,
      exp_mis: 10,
      obs_exp: 0.5,
      obs_exp_upper: 0.7,
      p_value: 1e-4,
      z_score: null,
      chisq_diff_null: 10,
    },
  ],
}

const viewerRegions = [{ start: 90, stop: 215 }]

const regionViewer = {
  centerPanelWidth: 500,
  isPositionDefined: () => true,
  leftPanelWidth: 100,
  regions: viewerRegions,
  rightPanelWidth: 100,
  scalePosition: regionViewerScale(viewerRegions, [0, 500]),
}

const TrackInRegionViewer = (props: {
  regionalMissenseConstraint?: RegionalMissenseConstraint
  variantIdsInTable?: Set<string>
  clinvarVariantIdsInTrack?: Set<string>
  clinvarTrackFilter?: PageFilter<ClinvarTrackFilter>
  variantTableFilter?: PageFilter<VariantFilterState>
  structureSelection?: StructureSelection | null
  onChangeStructureSelection?: (selection: StructureSelection | null) => void
  showAsPlot?: boolean
}) => (
  <MemoryRouter>
    <RegionViewerContext.Provider value={regionViewer}>
      <MissenseConstraint3dTrack datasetId="gnomad_r4" gene={gene} {...props} />
    </RegionViewerContext.Provider>
  </MemoryRouter>
)

// Like the gene page, which keeps the selection so that other sections can show its variants
const TrackWithStructureSelection = () => {
  const [structureSelection, setStructureSelection] = useState<StructureSelection | null>(null)
  return (
    <>
      <TrackInRegionViewer
        structureSelection={structureSelection}
        onChangeStructureSelection={setStructureSelection}
      />
      <output>
        {structureSelection &&
          JSON.stringify({
            residues: Array.from(structureSelection.residues),
            intervals: structureSelection.intervals,
          })}
      </output>
    </>
  )
}

// Like the gene page, which shares the filters of its ClinVar track and variant table with the
// structure's legend
const TrackWithPageFilters = ({
  initialClinvarTrackFilter = DEFAULT_CLINVAR_TRACK_FILTER,
  initialVariantTableFilter = DEFAULT_VARIANT_FILTER,
}: {
  initialClinvarTrackFilter?: ClinvarTrackFilter
  initialVariantTableFilter?: VariantFilterState
}) => {
  const [clinvarTrackFilter, setClinvarTrackFilter] = useState(initialClinvarTrackFilter)
  const [variantTableFilter, setVariantTableFilter] = useState(initialVariantTableFilter)
  return (
    <>
      <TrackInRegionViewer
        variantIdsInTable={new Set(['12-103-C-T'])}
        clinvarVariantIdsInTrack={new Set(['12-104-A-G'])}
        clinvarTrackFilter={{ filter: clinvarTrackFilter, onChangeFilter: setClinvarTrackFilter }}
        variantTableFilter={{ filter: variantTableFilter, onChangeFilter: setVariantTableFilter }}
      />
      <output>{JSON.stringify({ clinvarTrackFilter, variantTableFilter })}</output>
    </>
  )
}

// Like the gene page, which has the toggle above both missense constraint tracks
const TrackWithPlotToggle = () => {
  const [showAsPlot, setShowAsPlot] = useState(false)
  return (
    <MemoryRouter>
      <RegionViewerContext.Provider value={regionViewer}>
        <MissenseConstraintPlotToggle showAsPlot={showAsPlot} onChangeShowAsPlot={setShowAsPlot} />
        <MissenseConstraint3dTrack
          datasetId="gnomad_r4"
          gene={gene}
          regionalMissenseConstraint={regionalMissenseConstraint}
          showAsPlot={showAsPlot}
        />
      </RegionViewerContext.Provider>
    </MemoryRouter>
  )
}

const pageFiltersShown = () => JSON.parse(screen.getByRole('status').textContent!)

const viewerRender = (viewer: unknown) => (viewer as { render: jest.Mock }).render

const lastViewerProps = (viewer: unknown) => {
  const { calls } = viewerRender(viewer).mock
  return calls[calls.length - 1][0] as StructureViewerProps
}

const structureSelectionShown = () => {
  const output = screen.getByRole('status').textContent
  return output ? JSON.parse(output) : null
}

const hoverResidue = (residueNumber: number | null) =>
  act(() =>
    lastViewerProps(StructureViewer3Dmol).onHoverResidue(
      residueNumber === null ? null : { residueNumber, residueName: 'ALA', plddt: 90, x: 0, y: 0 }
    )
  )

const highlightedResidueRanges = () =>
  lastViewerProps(StructureViewer3Dmol).highlightedResidueRanges

// Of regions wide enough for black borders, which exon outlines also have
const trackRegionFills = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('rect[stroke="black"]:not([fill="none"])'), (rect) =>
    rect.getAttribute('fill')
  )

const showStructure = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Show structure' }))
  await waitFor(() => expect(viewerRender(StructureViewer3Dmol)).toHaveBeenCalled())
}

describe('MissenseConstraint3dTrack', () => {
  beforeEach(() => {
    setMockApiResponses({
      MissenseConstraint3d: () => ({ gene: { missense_constraint_3d: missenseConstraint3d } }),
      MissenseConstraint3dVariants: () => variantsResponse,
    })
  })

  test('has no unexpected changes', () => {
    expect(renderer.create(<TrackInRegionViewer />)).toMatchSnapshot()
  })

  test('draws segments too narrow for black borders with borders of their own color, and outlines exons', () => {
    // Residues 1 and 2, in different regions, share the first exon, and 3-4 fill the second
    setMockApiResponses({
      MissenseConstraint3d: () => ({
        gene: {
          missense_constraint_3d: {
            ...missenseConstraint3d,
            regions: [
              { ...missenseConstraint3d.regions[0], segments: [{ aa_start: 1, aa_stop: 1 }] },
              { ...missenseConstraint3d.regions[1], segments: [{ aa_start: 2, aa_stop: 4 }] },
            ],
          },
        },
      }),
    })
    // Zoomed out, so that each residue is less than a pixel wide
    const zoomedOutRegions = [{ start: 1, stop: 5000 }]
    const { container } = render(
      <MemoryRouter>
        <RegionViewerContext.Provider
          value={{
            ...regionViewer,
            regions: zoomedOutRegions,
            scalePosition: regionViewerScale(zoomedOutRegions, [0, 500]),
          }}
        >
          <MissenseConstraint3dTrack datasetId="gnomad_r4" gene={gene} />
        </RegionViewerContext.Provider>
      </MemoryRouter>
    )

    const segments = Array.from(container.querySelectorAll('rect[height="15"]:not([fill="none"])'))
    expect(segments).toHaveLength(3)
    segments.forEach((segment) => {
      expect(segment.getAttribute('stroke')).toBe(segment.getAttribute('fill'))
    })

    // A black outline around each exon
    const [firstExonStart, firstExonEnd, secondExon] = segments
    const exonOutlines = Array.from(container.querySelectorAll('rect[fill="none"]'))
    expect(exonOutlines.map((outline) => outline.getAttribute('stroke'))).toEqual([
      'black',
      'black',
    ])
    const edges = (rect: Element) => [
      Number(rect.getAttribute('x')),
      Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')),
    ]
    const [firstExonOutline, secondExonOutline] = exonOutlines.map(edges)
    expect(firstExonOutline[0]).toBe(edges(firstExonStart)[0])
    expect(firstExonOutline[1]).toBeCloseTo(edges(firstExonEnd)[1])
    expect(secondExonOutline[0]).toBe(edges(secondExon)[0])
    expect(secondExonOutline[1]).toBeCloseTo(edges(secondExon)[1])
  })

  test('lists the size and constraint of each region', async () => {
    const { container } = render(<TrackInRegionViewer />)
    await userEvent.click(screen.getByRole('button', { name: 'Show regions' }))

    expect(
      screen.getByText(
        '1 region, 1 of them significant (p ≤ 1e-3), and 2 unassigned residues. The region has 2 residues, in 1 stretch of sequence.'
      )
    ).not.toBeNull()
    const rowTexts = () =>
      screen
        .getAllByRole('row')
        .map((row) => Array.from(row.querySelectorAll('th, td'), (cell) => cell.textContent))
    expect(rowTexts().slice(1)).toEqual([
      ['#1 most constrained', '2', '1', '1-2', '0.05 (1/20.0)', '0.30', '1.00e-8'],
      ['Unassigned residue', '2', '1', '3-4', '0.90 (9/10.0)', '1.10', '5.00e-1'],
    ])

    // Sorted from the highest o/e first
    await userEvent.click(screen.getByRole('button', { name: 'Missense o/e' }))
    expect(rowTexts()[1][0]).toBe('Unassigned residue')

    await userEvent.hover(screen.getByRole('row', { name: /^#1 most constrained/ }))
    expect(container.querySelectorAll(`rect[stroke="${STRUCTURE_HIGHLIGHT_COLOR}"]`)).toHaveLength(
      1
    )

    // Like the button beside the track, the one below the table hides it
    const [, hideRegionsBelowTable] = screen.getAllByRole('button', { name: 'Hide regions' })
    await userEvent.click(hideRegionsBelowTable)
    expect(screen.queryByRole('row')).toBeNull()
  })

  test('plots the size and constraint of the regions', async () => {
    const { container } = render(<TrackInRegionViewer />)
    await userEvent.click(screen.getByRole('button', { name: 'Show regions' }))
    await userEvent.click(screen.getByRole('button', { name: 'Show plots' }))
    expect(logButtonClick).toHaveBeenCalledWith('User showed 3D missense constraint region plots')

    // The region has 2 residues
    const residuesPlot = screen.getByRole('heading', { name: 'Residues per region' }).parentElement!
    expect(within(residuesPlot).getByText('2-4')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Stretches of sequence per region' })).not.toBeNull()

    // The region and the unassigned residues, whose o/e together is (1 + 9) / (20 + 10)
    const obsExpPlot = screen.getByRole('heading', { name: 'Missense o/e by region size' })
      .parentElement!
    expect(within(obsExpPlot).getByText('All residues: 0.33')).not.toBeNull()
    expect(obsExpPlot.querySelectorAll('circle')).toHaveLength(1)
    expect(obsExpPlot.querySelectorAll(`rect[fill="${UNASSIGNED_RESIDUE_FILL}"]`)).toHaveLength(1)

    // Hovering a region shows its details and outlines it on the track
    await userEvent.hover(obsExpPlot.querySelector('circle')!)
    expect(screen.getByText('2, in 1 stretch of sequence')).not.toBeNull()
    expect(container.querySelectorAll(`rect[stroke="${STRUCTURE_HIGHLIGHT_COLOR}"]`)).toHaveLength(
      1
    )

    await userEvent.click(screen.getByRole('button', { name: 'Hide plots' }))
    expect(screen.queryByRole('heading', { name: 'Residues per region' })).toBeNull()
    // The table is still shown
    expect(screen.getAllByRole('row')).toHaveLength(3)
  })

  test('shows 3D and regional missense constraint as lines in one plot', async () => {
    const { container } = render(<TrackWithPlotToggle />)
    await userEvent.click(screen.getByRole('button', { name: 'Show missense constraint as plot' }))
    expect(logButtonClick).toHaveBeenCalledWith('User plotted missense constraint')
    expect(screen.getByText('Missense constraint')).not.toBeNull()
    expect(trackRegionFills(container)).toEqual([])

    // A line for each, broken between the two exons
    const line = (color: string) =>
      container.querySelector(`path[stroke="${color}"]`)!.getAttribute('d')!
    expect(line(MISSENSE_CONSTRAINT_3D_COLOR).match(/M/g)).toHaveLength(2)
    expect(line(REGIONAL_MISSENSE_CONSTRAINT_COLOR).match(/M/g)).toHaveLength(2)
    expect(screen.getByText('Regional missense constraint')).not.toBeNull()

    // Hovering shows both kinds of constraint at that part of the gene
    const [firstExon] = Array.from(container.querySelectorAll('rect[pointer-events="all"]'))
    await userEvent.hover(firstExon)
    expect(screen.getByText('#1 most constrained')).not.toBeNull()
    expect(screen.getByText('Met1-Lys4')).not.toBeNull()
    await userEvent.unhover(firstExon)

    const obsExpLine = line(MISSENSE_CONSTRAINT_3D_COLOR)
    await userEvent.click(screen.getByLabelText('o/e upper bound'))
    expect(line(MISSENSE_CONSTRAINT_3D_COLOR)).not.toBe(obsExpLine)

    await userEvent.click(
      screen.getByRole('button', { name: 'Show missense constraint as colors' })
    )
    expect(container.querySelector(`path[stroke="${MISSENSE_CONSTRAINT_3D_COLOR}"]`)).toBeNull()
    expect(trackRegionFills(container)).toHaveLength(2)
  })

  test('shows regional missense constraint as a track while there is no 3D missense constraint to plot', () => {
    setMockApiResponses({
      MissenseConstraint3d: () => ({ gene: { missense_constraint_3d: null } }),
    })
    render(
      <TrackInRegionViewer regionalMissenseConstraint={regionalMissenseConstraint} showAsPlot />
    )
    expect(screen.getByText('Regional missense constraint')).not.toBeNull()
    expect(
      screen.getByText('3D missense constraint is not available for this gene.')
    ).not.toBeNull()
  })

  test('says when 3D missense constraint is not available', () => {
    setMockApiResponses({
      MissenseConstraint3d: () => ({ gene: { missense_constraint_3d: null } }),
    })
    render(<TrackInRegionViewer />)
    expect(
      screen.getByText('3D missense constraint is not available for this gene.')
    ).not.toBeNull()
  })

  test('loads variants and the structure only when the structure is shown', async () => {
    render(<TrackInRegionViewer />)
    expect(mockApiCalls().map((call) => call.operationName)).toEqual(['MissenseConstraint3d'])

    await showStructure()

    expect(logButtonClick).toHaveBeenCalledWith('User showed 3D missense constraint structure')
    expect(mockApiCalls().map((call) => [call.operationName, call.variables])).toContainEqual([
      'MissenseConstraint3dVariants',
      { transcriptId: TRANSCRIPT_ID, datasetId: 'gnomad_r4', referenceGenome: 'GRCh38' },
    ])
    const viewerProps = lastViewerProps(StructureViewer3Dmol)
    expect(viewerProps.structureUrl).toBe(alphafoldStructureUrl('P00001'))
    expect(viewerProps.expectedSequence).toBe('MAGK')
    expect(viewerProps.residueColors).toEqual([
      NO_REGION_COLOR,
      missenseObsExpColorScale.darker,
      missenseObsExpColorScale.darker,
      UNASSIGNED_RESIDUE_HATCH_COLOR,
      NO_REGION_COLOR,
    ])
  })

  test('colors the track and the structure the same way', async () => {
    const { container } = render(<TrackInRegionViewer />)
    await showStructure()

    expect(trackRegionFills(container)).toContain(missenseObsExpColorScale.darker)
    expect(lastViewerProps(StructureViewer3Dmol).residueColors[1]).toBe(
      missenseObsExpColorScale.darker
    )

    await userEvent.click(screen.getByLabelText('Color unassigned residues'))
    expect(trackRegionFills(container)).toContain(missenseObsExpColorScale.lightest)
    expect(lastViewerProps(StructureViewer3Dmol).residueColors[4]).toBe(
      missenseObsExpColorScale.lightest
    )
  })

  test('adds a key for structure colors that the track legend does not describe', async () => {
    render(<TrackInRegionViewer regionalMissenseConstraint={regionalMissenseConstraint} />)
    expect(screen.getByText('Missense o/e upper bound')).not.toBeNull()

    await showStructure()
    expect(screen.queryByText('Regional missense constraint o/e')).toBeNull()

    await userEvent.click(screen.getByLabelText('RMC o/e'))
    expect(screen.getByText('Regional missense constraint o/e')).not.toBeNull()
  })

  test('highlights all residues of a region hovered in the track', async () => {
    const { container } = render(<TrackInRegionViewer />)
    await showStructure()

    const constrainedRegion = Array.from(container.querySelectorAll('rect[stroke="black"]')).find(
      (rect) => rect.getAttribute('fill') === missenseObsExpColorScale.darker
    )!
    await userEvent.hover(constrainedRegion)
    expect(lastViewerProps(StructureViewer3Dmol).highlightedResidueRanges).toEqual([[1, 2]])

    await userEvent.unhover(constrainedRegion)
    expect(lastViewerProps(StructureViewer3Dmol).highlightedResidueRanges).toEqual([])
  })

  test('outlines every segment of a highlighted region on the track', async () => {
    const [constrainedRegion, catchAllRegion] = missenseConstraint3d.regions
    setMockApiResponses({
      MissenseConstraint3d: () => ({
        gene: {
          missense_constraint_3d: {
            ...missenseConstraint3d,
            // Residues 1 and 3 are close together in 3D
            regions: [
              {
                ...constrainedRegion,
                segments: [
                  { aa_start: 1, aa_stop: 1 },
                  { aa_start: 3, aa_stop: 3 },
                ],
              },
              {
                ...catchAllRegion,
                segments: [
                  { aa_start: 2, aa_stop: 2 },
                  { aa_start: 4, aa_stop: 4 },
                ],
              },
            ],
          },
        },
      }),
      MissenseConstraint3dVariants: () => variantsResponse,
    })
    const { container } = render(<TrackInRegionViewer />)
    await showStructure()
    const outlinedSegments = () =>
      container.querySelectorAll(`rect[stroke="${STRUCTURE_HIGHLIGHT_COLOR}"]`).length

    const [firstSegment] = Array.from(container.querySelectorAll('rect[stroke="black"]'))
    await userEvent.hover(firstSegment)
    expect(highlightedResidueRanges()).toEqual([
      [1, 1],
      [3, 3],
    ])
    expect(outlinedSegments()).toBe(2)

    await userEvent.unhover(firstSegment)
    expect(outlinedSegments()).toBe(0)
  })

  test('shows the whole region of a residue hovered in Regions mode', async () => {
    render(<TrackInRegionViewer />)
    await showStructure()

    hoverResidue(1)
    expect(highlightedResidueRanges()).toEqual([])

    await userEvent.click(screen.getByLabelText('Regions'))
    hoverResidue(1)
    expect(highlightedResidueRanges()).toEqual([[1, 2]])
    hoverResidue(null)
    expect(highlightedResidueRanges()).toEqual([])
  })

  test('pins a region clicked in Regions mode', async () => {
    const { container } = render(<TrackInRegionViewer />)
    await showStructure()

    // Only in Regions mode
    act(() => lastViewerProps(StructureViewer3Dmol).onClickResidue(1))
    expect(screen.queryByText(/^Pinned/)).toBeNull()

    await userEvent.click(screen.getByLabelText('Regions'))
    act(() => lastViewerProps(StructureViewer3Dmol).onClickResidue(1))
    expect(screen.getByText('Pinned: #1 most constrained, o/e 0.05, 2 residues.')).not.toBeNull()
    expect(highlightedResidueRanges()).toEqual([[1, 2]])
    // Hovering other residues, like while rotating the structure, keeps it highlighted
    hoverResidue(3)
    expect(highlightedResidueRanges()).toEqual([[1, 2]])

    await userEvent.click(screen.getByRole('button', { name: 'Unpin' }))
    expect(screen.queryByText(/^Pinned/)).toBeNull()
    expect(highlightedResidueRanges()).toEqual([])

    const catchAllSegment = Array.from(container.querySelectorAll('rect[stroke="black"]')).find(
      (rect) => rect.getAttribute('fill') === UNASSIGNED_RESIDUE_FILL
    )!
    await userEvent.click(catchAllSegment)
    await userEvent.unhover(catchAllSegment)
    expect(screen.getByText('Pinned: Unassigned residue, o/e 0.90, 2 residues.')).not.toBeNull()
    expect(highlightedResidueRanges()).toEqual([[3, 4]])

    await userEvent.click(screen.getByLabelText('Missense o/e'))
    expect(highlightedResidueRanges()).toEqual([])
  })

  test('lists the UniProt features that can be shown on the structure', async () => {
    render(<TrackInRegionViewer />)
    await showStructure()

    expect(screen.getByRole('heading', { name: /^UniProt features/ })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Regions' })).not.toBeNull()
    expect(screen.queryByRole('heading', { name: 'Residues' })).toBeNull()
    expect(screen.getByLabelText('Transmembrane (1)')).not.toBeNull()

    // Variants come from the page's variant table and ClinVar track, once they're listed there
    expect(screen.queryByText('gnomAD variants table')).toBeNull()
    expect(screen.queryByText('ClinVar track')).toBeNull()
  })

  test('shows UniProt features selected in the legend in rows and on the structure', async () => {
    const { container } = render(<TrackInRegionViewer />)
    await showStructure()
    const featureRects = () =>
      container.querySelectorAll(
        `rect[fill="${UNIPROT_FEATURE_OVERLAY_STYLES['transmembrane region'].color}"]`
      )
    expect(featureRects()).toHaveLength(0)
    expect(screen.getByText(/Select features in the legend/)).not.toBeNull()
    expect(
      screen.getAllByRole('link', { name: 'P00001' }).map((link) => link.getAttribute('href'))
    ).toContain(uniprotEntryUrl('P00001'))

    await userEvent.click(screen.getByLabelText('Transmembrane (1)'))
    // The feature spans the intron between the two coding exons
    expect(featureRects()).toHaveLength(2)
    expect(lastViewerProps(StructureViewer3Dmol).overlays.map(({ id }) => id)).toEqual([
      'uniprot-transmembrane-region',
    ])

    await userEvent.hover(featureRects()[0])
    expect(lastViewerProps(StructureViewer3Dmol).highlightedResidueRanges).toEqual([[2, 3]])
  })

  test('selects all UniProt features at once', async () => {
    setMockApiResponses({
      MissenseConstraint3d: () => ({
        gene: {
          missense_constraint_3d: {
            ...missenseConstraint3d,
            uniprot_features: [
              ...missenseConstraint3d.uniprot_features,
              { feature_type: 'binding site', start: 1, stop: 1, note: 'Zinc' },
            ],
          },
        },
      }),
      MissenseConstraint3dVariants: () => variantsResponse,
    })
    render(<TrackInRegionViewer />)
    await showStructure()
    expect(screen.queryByRole('button', { name: 'Reset UniProt features' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Select all UniProt features' }))
    expect((screen.getByLabelText('Binding site (1)') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Transmembrane (1)') as HTMLInputElement).checked).toBe(true)
    expect(lastViewerProps(StructureViewer3Dmol).overlays.map(({ id }) => id)).toEqual([
      'uniprot-binding-site',
      'uniprot-transmembrane-region',
    ])
    // With everything selected, only Reset is offered
    expect(screen.queryByRole('button', { name: 'Select all UniProt features' })).toBeNull()

    await userEvent.click(screen.getByLabelText('Binding site (1)'))
    expect(screen.getByRole('button', { name: 'Select all UniProt features' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Reset UniProt features' })).not.toBeNull()
  })

  test('shows UniProt features of single residues as diamonds', async () => {
    setMockApiResponses({
      MissenseConstraint3d: () => ({
        gene: {
          missense_constraint_3d: {
            ...missenseConstraint3d,
            uniprot_features: [{ feature_type: 'binding site', start: 1, stop: 1, note: 'Zinc' }],
          },
        },
      }),
      MissenseConstraint3dVariants: () => variantsResponse,
    })
    const { container } = render(<TrackInRegionViewer />)
    await showStructure()
    await userEvent.click(screen.getByLabelText('Binding site (1)'))

    const diamonds = container.querySelectorAll(
      `path[fill="${UNIPROT_FEATURE_OVERLAY_STYLES['binding site'].color}"]`
    )
    expect(diamonds).toHaveLength(1)
    // Centered on the residue's codon, bases 100-102, in the middle of its row
    const x = (regionViewer.scalePosition(100) + regionViewer.scalePosition(102)) / 2
    expect(diamonds[0].getAttribute('d')).toBe(`M${x},3L${x + 5},8L${x},13L${x - 5},8Z`)

    await userEvent.hover(diamonds[0])
    expect(lastViewerProps(StructureViewer3Dmol).highlightedResidueRanges).toEqual([[1, 1]])
  })

  test('shows the variants listed in the variant table on the structure', async () => {
    render(
      <TrackInRegionViewer
        variantIdsInTable={new Set(['12-103-C-T', '12-201-G-A', '12-999-A-T'])}
      />
    )
    await showStructure()

    // 12-201-G-A's HGVSp doesn't match the sequence, and 12-999-A-T isn't in the transcript
    await userEvent.click(screen.getByLabelText('Current selection (1 of 3)'))
    expect(
      lastViewerProps(StructureViewer3Dmol).overlays.map(({ id, residueRanges }) => [
        id,
        residueRanges,
      ])
    ).toEqual([['gnomad-table-missense', [[2, 2]]]])
  })

  test('shows the variants listed in the ClinVar track on the structure', async () => {
    render(<TrackInRegionViewer clinvarVariantIdsInTrack={new Set(['12-104-A-G'])} />)
    await showStructure()

    await userEvent.click(screen.getByLabelText('Current selection (1 of 1)'))
    expect(
      lastViewerProps(StructureViewer3Dmol).overlays.map(({ id, residueRanges }) => [
        id,
        residueRanges,
      ])
    ).toEqual([['clinvar-track-pathogenic', [[3, 3]]]])
  })

  test('changes the variant table filter from the legend', async () => {
    render(<TrackWithPageFilters />)
    await showStructure()

    await userEvent.click(screen.getByLabelText('Synonymous'))
    await userEvent.type(screen.getByPlaceholderText('Search variant table'), 'p.Ala2')
    expect(pageFiltersShown().variantTableFilter).toEqual({
      ...DEFAULT_VARIANT_FILTER,
      includeCategories: { ...DEFAULT_VARIANT_FILTER.includeCategories, synonymous: false },
      searchText: 'p.Ala2',
    })

    await userEvent.click(screen.getByRole('button', { name: 'Reset gnomAD variants table' }))
    expect(pageFiltersShown().variantTableFilter).toEqual(DEFAULT_VARIANT_FILTER)
  })

  test('changes the ClinVar track filter from the legend', async () => {
    render(<TrackWithPageFilters />)
    await showStructure()

    await userEvent.click(screen.getByLabelText('Pathogenic / likely pathogenic'))
    await userEvent.selectOptions(screen.getByLabelText(/review status/), '2')
    expect(pageFiltersShown().clinvarTrackFilter).toEqual({
      includedClinicalSignificanceCategories: {
        ...DEFAULT_CLINVAR_TRACK_FILTER.includedClinicalSignificanceCategories,
        pathogenic: false,
      },
      starFilter: 2,
    })

    await userEvent.click(screen.getByRole('button', { name: 'Reset ClinVar track' }))
    expect(pageFiltersShown().clinvarTrackFilter).toEqual(DEFAULT_CLINVAR_TRACK_FILTER)
  })

  test('shows the filters of the ClinVar track and variant table in the legend', async () => {
    render(
      <TrackWithPageFilters
        initialClinvarTrackFilter={{ ...DEFAULT_CLINVAR_TRACK_FILTER, starFilter: 3 }}
        initialVariantTableFilter={{
          ...DEFAULT_VARIANT_FILTER,
          includeCategories: { ...DEFAULT_VARIANT_FILTER.includeCategories, lof: false },
          searchText: 'rs123',
        }}
      />
    )
    await showStructure()

    expect((screen.getByLabelText(/review status/) as HTMLSelectElement).value).toBe('3')
    expect((screen.getByLabelText('pLoF') as HTMLInputElement).checked).toBe(false)
    expect((screen.getByPlaceholderText('Search variant table') as HTMLInputElement).value).toBe(
      'rs123'
    )
  })

  test('lists UniProt features before the variants of other sections of the page', async () => {
    render(
      <TrackInRegionViewer
        variantIdsInTable={new Set(['12-103-C-T'])}
        clinvarVariantIdsInTrack={new Set(['12-104-A-G'])}
      />
    )
    await showStructure()

    const headings = screen.getAllByRole('heading').map((heading) => heading.textContent!)
    const position = (name: string) => headings.findIndex((heading) => heading.startsWith(name))
    expect(position('UniProt features')).toBeLessThan(position('ClinVar track'))
    expect(position('ClinVar track')).toBeLessThan(position('gnomAD variants table'))
  })

  test('sets the transparency and size of variants and features on the structure', async () => {
    render(<TrackInRegionViewer />)
    await showStructure()
    expect(lastViewerProps(StructureViewer3Dmol)).toMatchObject({
      overlayOpacity: 1,
      overlaySize: 1,
    })

    fireEvent.change(screen.getByLabelText('Transparency'), { target: { value: '0.25' } })
    fireEvent.change(screen.getByLabelText('Size'), { target: { value: '3' } })
    expect(lastViewerProps(StructureViewer3Dmol)).toMatchObject({
      overlayOpacity: 0.75,
      overlaySize: 3,
    })
  })

  test('colors the structure by regional missense constraint when it is available', async () => {
    render(<TrackInRegionViewer />)
    await showStructure()
    expect(screen.queryByLabelText('RMC o/e')).toBeNull()
    expect(screen.queryByLabelText('RMC o/e upper')).toBeNull()
  })

  test('colors the structure by the upper bound of regional missense constraint', async () => {
    render(<TrackInRegionViewer regionalMissenseConstraint={regionalMissenseConstraint} />)
    await showStructure()

    await userEvent.click(screen.getByLabelText('RMC o/e upper'))
    expect(lastViewerProps(StructureViewer3Dmol).residueColors.slice(1)).toEqual(
      Array(4).fill(missenseObsExpColorScale.lighter)
    )
    // In the key above the structure, and on a track of its own
    expect(screen.getAllByText('Regional missense constraint o/e upper bound')).toHaveLength(2)
    expect(screen.getByText('RMC o/e upper bound')).not.toBeNull()
  })

  test('offers the upper bound of regional missense constraint only when it is known', async () => {
    const [region] = regionalMissenseConstraint.regions
    render(
      <TrackInRegionViewer
        regionalMissenseConstraint={{
          ...regionalMissenseConstraint,
          regions: [{ ...region, obs_exp_upper: undefined }],
        }}
      />
    )
    await showStructure()
    expect(screen.getByLabelText('RMC o/e')).not.toBeNull()
    expect(screen.queryByLabelText('RMC o/e upper')).toBeNull()
  })

  test('colors the structure by regional missense constraint', async () => {
    render(<TrackInRegionViewer regionalMissenseConstraint={regionalMissenseConstraint} />)
    await showStructure()

    await userEvent.click(screen.getByLabelText('RMC o/e'))
    expect(lastViewerProps(StructureViewer3Dmol).residueColors.slice(1)).toEqual(
      Array(4).fill(missenseObsExpColorScale.middle)
    )
  })

  test('colors the structure by the pLDDT of the loaded structure', async () => {
    render(<TrackInRegionViewer />)
    await showStructure()

    const plddtByResidue: number[] = []
    plddtByResidue[1] = 95
    plddtByResidue[2] = 80
    plddtByResidue[3] = 60
    plddtByResidue[4] = 30
    act(() => lastViewerProps(StructureViewer3Dmol).onLoadStructure(plddtByResidue))

    await userEvent.click(screen.getByLabelText('pLDDT'))
    expect(lastViewerProps(StructureViewer3Dmol).residueColors).toEqual([
      NO_REGION_COLOR,
      ...PLDDT_BANDS.map((band) => band.color),
    ])
    expect(screen.getByText('AlphaFold confidence')).not.toBeNull()

    await userEvent.hover(screen.getByRole('button', { name: 'Very high (pLDDT > 90)' }))
    expect(lastViewerProps(StructureViewer3Dmol).highlightedResidueRanges).toEqual([[1, 1]])
  })

  test('shows the pLDDT of the loaded structure along the gene while coloring by it', async () => {
    const { container } = render(<TrackInRegionViewer />)
    await showStructure()

    const plddtByResidue: number[] = []
    plddtByResidue[1] = 95
    plddtByResidue[2] = 92
    plddtByResidue[3] = 60
    plddtByResidue[4] = 30
    act(() => lastViewerProps(StructureViewer3Dmol).onLoadStructure(plddtByResidue))
    expect(screen.queryByText('AlphaFold pLDDT')).toBeNull()

    await userEvent.click(screen.getByLabelText('pLDDT'))
    expect(screen.getByText('AlphaFold pLDDT')).not.toBeNull()

    // Residues 1 and 2 are both very high, and residues 3 and 4 are in the other coding exon
    const plddtRuns = Array.from(container.querySelectorAll('rect[height="15"]')).filter((rect) =>
      PLDDT_BANDS.some((band) => band.color === rect.getAttribute('fill'))
    )
    expect(plddtRuns.map((rect) => rect.getAttribute('fill'))).toEqual([
      PLDDT_BANDS[0].color,
      PLDDT_BANDS[2].color,
      PLDDT_BANDS[3].color,
    ])

    await userEvent.hover(plddtRuns[0])
    expect(lastViewerProps(StructureViewer3Dmol).highlightedResidueRanges).toEqual([[1, 2]])

    await userEvent.click(screen.getByLabelText('Missense o/e'))
    expect(screen.queryByText('AlphaFold pLDDT')).toBeNull()
  })

  test('can show the structure without colors', async () => {
    render(<TrackInRegionViewer />)
    await showStructure()

    await userEvent.click(screen.getByLabelText('None'))
    expect(lastViewerProps(StructureViewer3Dmol).residueColors).toEqual(
      Array(5).fill(NO_REGION_COLOR)
    )
  })

  test('can show the structure with either viewer library', async () => {
    render(<TrackInRegionViewer />)
    await showStructure()

    await userEvent.click(screen.getByLabelText('Mol*'))
    await waitFor(() => expect(viewerRender(StructureViewerMolstar)).toHaveBeenCalled())
  })

  test('selects residues on the structure by clicking them', async () => {
    render(<TrackWithStructureSelection />)
    await showStructure()

    // Clicks only select residues once a way of selecting them is chosen
    act(() => lastViewerProps(StructureViewer3Dmol).onClickResidue(2))
    expect(structureSelectionShown()).toBeNull()

    await userEvent.click(screen.getByLabelText('Residue'))
    act(() => lastViewerProps(StructureViewer3Dmol).onClickResidue(2))
    expect(structureSelectionShown()).toEqual({
      residues: [2],
      intervals: [{ start: 103, stop: 105 }],
    })
    expect(screen.getByText('1 residue selected.')).not.toBeNull()
    // Residues outside the selection are faded
    const { residueColors } = lastViewerProps(StructureViewer3Dmol)
    expect(residueColors[2]).toBe(missenseObsExpColorScale.darker)
    expect(residueColors[1]).not.toBe(missenseObsExpColorScale.darker)

    act(() => lastViewerProps(StructureViewer3Dmol).onClickResidue(2))
    expect(structureSelectionShown()).toBeNull()
  })

  test('selects the 3D region of a clicked residue', async () => {
    render(<TrackWithStructureSelection />)
    await showStructure()

    await userEvent.click(screen.getByLabelText('3D region'))
    act(() => lastViewerProps(StructureViewer3Dmol).onClickResidue(3))
    // The region of residues 3 and 4 spans the intron between the two coding exons
    expect(structureSelectionShown()).toEqual({
      residues: [3, 4],
      intervals: [{ start: 200, stop: 205 }],
    })

    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(structureSelectionShown()).toBeNull()
  })

  test('selects the residues in a box drawn on the structure', async () => {
    const { container } = render(<TrackWithStructureSelection />)
    await showStructure()

    await userEvent.click(screen.getByLabelText('Box'))
    const boxSelectionLayer = container.querySelector('[class*="BoxSelectionLayer"]')!
    fireEvent.pointerDown(boxSelectionLayer, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(boxSelectionLayer, { clientX: 60, clientY: 40 })
    fireEvent.pointerUp(boxSelectionLayer, { clientX: 60, clientY: 40 })
    expect(structureSelectionShown()).toEqual({
      residues: [1, 2],
      intervals: [{ start: 100, stop: 105 }],
    })
  })

  test('zooms the structure with buttons and, in smaller steps, the mouse wheel', async () => {
    const { container } = render(<TrackInRegionViewer />)
    await showStructure()
    const { handle } = jest.requireMock<{ handle: StructureViewerHandle }>('./StructureViewer3Dmol')

    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(handle.zoomBy).toHaveBeenLastCalledWith(1.25)
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(handle.zoomBy).toHaveBeenLastCalledWith(0.8)

    // Scrolling down zooms out
    fireEvent.wheel(container.querySelector('[class*="ViewerWrapper"]')!, { deltaY: 100 })
    const { calls } = (handle.zoomBy as jest.Mock).mock
    expect(calls[calls.length - 1][0]).toBeCloseTo(Math.exp(-0.1))
  })

  test('explains the colors of ranked regions in the legend', async () => {
    render(<TrackInRegionViewer />)
    await showStructure()

    await userEvent.click(screen.getByLabelText('Regions'))
    // On a track of its own, below the track of o/e upper bounds
    expect(screen.getByText('Ranked 3D regions')).not.toBeNull()
    // Details of the ranking are in a tooltip, which keeps the legend short
    expect(screen.queryByText(/ranked by missense o\/e/)).toBeNull()
    await userEvent.hover(screen.getByText('Rank'))
    expect(
      screen.getByText(
        'Regions with p ≤ 1e-3, ranked by missense o/e from the most constrained (1). Up to 10 are shown in color, and other regions are gray.'
      )
    ).not.toBeNull()
    expect(screen.getByRole('button', { name: '1' })).not.toBeNull()
    expect(screen.getByText('Not significant (p > 1e-3)')).not.toBeNull()
    expect(screen.getAllByText('Unassigned residue')).toHaveLength(2)
  })

  test('shows the structure’s other colors of regions on a track of their own', async () => {
    const { container } = render(<TrackInRegionViewer />)
    await showStructure()
    expect(screen.queryByText('3D missense o/e')).toBeNull()

    await userEvent.click(screen.getByLabelText('Missense o/e'))
    expect(screen.getByText('3D missense o/e')).not.toBeNull()
    // The track of 3D regions keeps their o/e upper bounds
    expect(trackRegionFills(container)).toEqual([
      missenseObsExpColorScale.darker,
      UNASSIGNED_RESIDUE_FILL,
      missenseObsExpColorScale.darkest,
      UNASSIGNED_RESIDUE_FILL,
    ])

    // RMC o/e is on the regional missense constraint track already
    await userEvent.click(screen.getByLabelText('None'))
    expect(screen.queryByText('3D missense o/e')).toBeNull()
  })

  test('hatches unassigned residues while they are gray', async () => {
    const { container } = render(<TrackInRegionViewer />)
    await showStructure()
    expect(container.querySelector(`pattern#${UNASSIGNED_RESIDUE_PATTERN_ID}`)).not.toBeNull()
    expect(trackRegionFills(container)).toContain(UNASSIGNED_RESIDUE_FILL)
    expect(screen.getByText('Unassigned residue')).not.toBeNull()

    await userEvent.click(screen.getByLabelText('Color unassigned residues'))
    expect(trackRegionFills(container)).not.toContain(UNASSIGNED_RESIDUE_FILL)
    expect(screen.queryByText('Unassigned residue')).toBeNull()
  })

  test('colors regions that are not significant unless asked not to', async () => {
    const [constrainedRegion, catchAllRegion] = missenseConstraint3d.regions
    setMockApiResponses({
      MissenseConstraint3d: () => ({
        gene: {
          missense_constraint_3d: {
            ...missenseConstraint3d,
            regions: [{ ...constrainedRegion, p_value: 0.01 }, catchAllRegion],
          },
        },
      }),
      MissenseConstraint3dVariants: () => variantsResponse,
    })
    const { container } = render(<TrackInRegionViewer />)
    await showStructure()
    expect(trackRegionFills(container)).toContain(missenseObsExpColorScale.darker)
    expect(lastViewerProps(StructureViewer3Dmol).residueColors[1]).toBe(
      missenseObsExpColorScale.darker
    )
    expect(screen.queryByText('Not significant (p > 1e-3)')).toBeNull()

    await userEvent.click(screen.getByLabelText('Color non-significant regions'))
    expect(trackRegionFills(container)).not.toContain(missenseObsExpColorScale.darker)
    expect(trackRegionFills(container)).toContain(NO_REGION_COLOR)
    expect(lastViewerProps(StructureViewer3Dmol).residueColors[1]).toBe(NO_REGION_COLOR)
    expect(screen.getByText('Not significant (p > 1e-3)')).not.toBeNull()
  })

  test('highlights and selects the residues of a color in the legend', async () => {
    render(<TrackWithStructureSelection />)
    // Region 0's o/e upper bound is 0.3
    const binName = 'Missense o/e upper bound 0.2–0.4'
    expect(screen.queryByRole('button', { name: binName })).toBeNull()
    await showStructure()

    const bin = screen.getByRole('button', { name: binName })
    await userEvent.hover(bin)
    expect(lastViewerProps(StructureViewer3Dmol).highlightedResidueRanges).toEqual([[1, 2]])
    await userEvent.unhover(bin)
    expect(lastViewerProps(StructureViewer3Dmol).highlightedResidueRanges).toEqual([])

    const unassignedResidues = screen.getByRole('button', { name: 'Unassigned residue' })
    await userEvent.click(unassignedResidues)
    expect(structureSelectionShown()).toEqual({
      residues: [3, 4],
      intervals: [{ start: 200, stop: 205 }],
    })
    fireEvent.keyDown(unassignedResidues, { key: 'Enter' })
    expect(structureSelectionShown()).toBeNull()

    await userEvent.click(screen.getByLabelText('Regions'))
    await userEvent.hover(screen.getByRole('button', { name: '1' }))
    expect(lastViewerProps(StructureViewer3Dmol).highlightedResidueRanges).toEqual([[1, 2]])
  })

  test('resets the coloring', async () => {
    render(<TrackInRegionViewer />)
    await showStructure()
    const resetColors = screen.getByRole('button', { name: 'Reset colors' }) as HTMLButtonElement
    expect(resetColors.disabled).toBe(true)

    await userEvent.click(screen.getByLabelText('Missense o/e'))
    await userEvent.click(screen.getByLabelText('Color non-significant regions'))
    await userEvent.click(screen.getByLabelText('Color unassigned residues'))
    await userEvent.click(resetColors)
    expect((screen.getByLabelText('o/e upper bound') as HTMLInputElement).checked).toBe(true)
    expect(
      (screen.getByLabelText('Color non-significant regions') as HTMLInputElement).checked
    ).toBe(true)
    expect((screen.getByLabelText('Color unassigned residues') as HTMLInputElement).checked).toBe(
      false
    )
  })

  test('resets each section of the legend separately', async () => {
    render(<TrackInRegionViewer variantIdsInTable={new Set(['12-103-C-T'])} />)
    await showStructure()
    expect(screen.queryByRole('button', { name: 'Reset UniProt features' })).toBeNull()

    await userEvent.click(screen.getByLabelText('Transmembrane (1)'))
    await userEvent.click(screen.getByLabelText('Current selection (1 of 1)'))
    fireEvent.change(screen.getByLabelText('Transparency'), { target: { value: '0.5' } })

    await userEvent.click(screen.getByRole('button', { name: 'Reset UniProt features' }))
    expect(lastViewerProps(StructureViewer3Dmol).overlays.map(({ id }) => id)).toEqual([
      'gnomad-table-missense',
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Reset display' }))
    expect(lastViewerProps(StructureViewer3Dmol).overlayOpacity).toBe(1)
    expect(lastViewerProps(StructureViewer3Dmol).overlays.map(({ id }) => id)).toEqual([
      'gnomad-table-missense',
    ])
  })

  test('resets the rotation and zoom of the structure', async () => {
    render(<TrackInRegionViewer />)
    await showStructure()
    const { resetViewCount } = lastViewerProps(StructureViewer3Dmol)

    await userEvent.click(screen.getByRole('button', { name: 'Reset rotation and zoom' }))
    expect(lastViewerProps(StructureViewer3Dmol).resetViewCount).toBe(resetViewCount + 1)
  })

  test('clears the selection when the structure is hidden', async () => {
    render(<TrackWithStructureSelection />)
    await showStructure()

    await userEvent.click(screen.getByLabelText('Residue'))
    act(() => lastViewerProps(StructureViewer3Dmol).onClickResidue(2))
    await userEvent.click(screen.getByRole('button', { name: 'Hide structure' }))
    expect(structureSelectionShown()).toBeNull()
  })
})
