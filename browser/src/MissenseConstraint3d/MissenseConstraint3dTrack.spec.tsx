import React, { useState } from 'react'
import renderer from 'react-test-renderer'
import { jest, describe, expect, test, beforeEach, afterEach } from '@jest/globals'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { RegionViewerContext, regionViewerScale } from '@gnomad/region-viewer'

import { mockQueries } from '../../../tests/__helpers__/queries'
import Query, { BaseQuery } from '../Query'
import { logButtonClick } from '../analytics'
import geneFactory from '../__factories__/Gene'
import { Gene } from '../GenePage/GenePage'
import {
  RegionalMissenseConstraint,
  missenseObsExpColorScale,
} from '../RegionalMissenseConstraintTrack'
import MissenseConstraint3dTrack from './MissenseConstraint3dTrack'
import {
  MissenseConstraint3d,
  NO_REGION_COLOR,
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
        rsids: ['rs1'],
        consequence: 'missense_variant',
        hgvsc: 'c.5C>T',
        hgvsp: 'p.Ala2Val',
      },
      {
        variant_id: '12-201-G-A',
        rsids: null,
        consequence: 'missense_variant',
        hgvsc: null,
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
  structureSelection?: StructureSelection | null
  onChangeStructureSelection?: (selection: StructureSelection | null) => void
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

const trackRegionFills = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('rect[stroke="black"]'), (rect) =>
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

  test('draws segments too narrow to show their color without borders', () => {
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
    const segments = container.querySelectorAll('rect[height="15"]')
    expect(segments).toHaveLength(2)
    segments.forEach((segment) => expect(segment.getAttribute('stroke')).toBeNull())
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
      missenseObsExpColorScale.darkest,
      missenseObsExpColorScale.darkest,
      UNASSIGNED_RESIDUE_HATCH_COLOR,
      NO_REGION_COLOR,
    ])
  })

  test('colors the track and the structure the same way', async () => {
    const { container } = render(<TrackInRegionViewer />)
    await showStructure()

    await userEvent.click(screen.getByLabelText('o/e upper bound'))
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
    expect(screen.getByText('Missense observed/expected')).not.toBeNull()

    await showStructure()
    expect(screen.queryByText('Regional missense constraint o/e')).toBeNull()

    await userEvent.click(screen.getByLabelText('RMC o/e'))
    expect(screen.getByText('Regional missense constraint o/e')).not.toBeNull()
  })

  test('highlights all residues of a region hovered in the track', async () => {
    const { container } = render(<TrackInRegionViewer />)
    await showStructure()

    const constrainedRegion = Array.from(container.querySelectorAll('rect[stroke="black"]')).find(
      (rect) => rect.getAttribute('fill') === missenseObsExpColorScale.darkest
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

  test('filters the variant table variants on the structure by consequence', async () => {
    render(<TrackInRegionViewer variantIdsInTable={new Set(['12-103-C-T'])} />)
    await showStructure()
    await userEvent.click(screen.getByLabelText('Current selection (1 of 1)'))

    await userEvent.click(screen.getByLabelText('Missense / Inframe indel'))
    expect(lastViewerProps(StructureViewer3Dmol).overlays).toEqual([])

    await userEvent.click(screen.getByRole('button', { name: 'all' }))
    expect(lastViewerProps(StructureViewer3Dmol).overlays.map(({ id }) => id)).toEqual([
      'gnomad-table-missense',
    ])
  })

  test('searches the variant table variants on the structure', async () => {
    render(<TrackInRegionViewer variantIdsInTable={new Set(['12-103-C-T'])} />)
    await showStructure()
    await userEvent.click(screen.getByLabelText('Current selection (1 of 1)'))

    const search = screen.getByPlaceholderText('Search variants')
    await userEvent.type(search, 'p.Gly')
    expect(lastViewerProps(StructureViewer3Dmol).overlays).toEqual([])

    await userEvent.clear(search)
    await userEvent.type(search, 'RS1')
    expect(lastViewerProps(StructureViewer3Dmol).overlays.map(({ id }) => id)).toEqual([
      'gnomad-table-missense',
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Reset gnomAD variants table' }))
    expect((screen.getByPlaceholderText('Search variants') as HTMLInputElement).value).toBe('')
  })

  test('filters the ClinVar track variants on the structure by review status', async () => {
    render(<TrackInRegionViewer clinvarVariantIdsInTrack={new Set(['12-104-A-G'])} />)
    await showStructure()
    await userEvent.click(screen.getByLabelText('Current selection (1 of 1)'))
    const reviewStatusFilter = () => screen.getByLabelText(/review status/) as HTMLSelectElement

    // The variant has 2 stars
    await userEvent.selectOptions(reviewStatusFilter(), '3')
    expect(lastViewerProps(StructureViewer3Dmol).overlays).toEqual([])
    await userEvent.selectOptions(reviewStatusFilter(), '2')
    expect(lastViewerProps(StructureViewer3Dmol).overlays.map(({ id }) => id)).toEqual([
      'clinvar-track-pathogenic',
    ])

    await userEvent.selectOptions(reviewStatusFilter(), '4')
    await userEvent.click(screen.getByRole('button', { name: 'Reset ClinVar track' }))
    expect(reviewStatusFilter().value).toBe('0')
  })

  test('filters the ClinVar track variants on the structure by clinical significance', async () => {
    render(<TrackInRegionViewer clinvarVariantIdsInTrack={new Set(['12-104-A-G'])} />)
    await showStructure()
    await userEvent.click(screen.getByLabelText('Current selection (1 of 1)'))

    await userEvent.click(screen.getByLabelText('Pathogenic / likely pathogenic'))
    expect(lastViewerProps(StructureViewer3Dmol).overlays).toEqual([])

    await userEvent.click(screen.getByRole('button', { name: 'all' }))
    expect(lastViewerProps(StructureViewer3Dmol).overlays.map(({ id }) => id)).toEqual([
      'clinvar-track-pathogenic',
    ])
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
    expect(screen.getByText('Very high (pLDDT > 90)')).not.toBeNull()

    await userEvent.hover(screen.getByRole('button', { name: 'Very high (pLDDT > 90)' }))
    expect(lastViewerProps(StructureViewer3Dmol).highlightedResidueRanges).toEqual([[1, 1]])
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
    expect(residueColors[2]).toBe(missenseObsExpColorScale.darkest)
    expect(residueColors[1]).not.toBe(missenseObsExpColorScale.darkest)

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
    expect(
      screen.getByText('Significant regions (p ≤ 1e-3), most constrained first')
    ).not.toBeNull()
    expect(screen.getByText('1 · o/e 0.05')).not.toBeNull()
    expect(screen.getByText('Not significant (p > 1e-3)')).not.toBeNull()
    expect(screen.getByText('Unassigned residue')).not.toBeNull()
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
    expect(trackRegionFills(container)).toContain(missenseObsExpColorScale.darkest)
    expect(lastViewerProps(StructureViewer3Dmol).residueColors[1]).toBe(
      missenseObsExpColorScale.darkest
    )
    expect(screen.queryByText('Not significant (p > 1e-3)')).toBeNull()

    await userEvent.click(screen.getByLabelText('Color non-significant regions'))
    expect(trackRegionFills(container)).not.toContain(missenseObsExpColorScale.darkest)
    expect(trackRegionFills(container)).toContain(NO_REGION_COLOR)
    expect(lastViewerProps(StructureViewer3Dmol).residueColors[1]).toBe(NO_REGION_COLOR)
    expect(screen.getByText('Not significant (p > 1e-3)')).not.toBeNull()
  })

  test('highlights and selects the residues of a color in the legend', async () => {
    render(<TrackWithStructureSelection />)
    const darkestBinName = 'Missense observed/expected 0.0–0.2'
    expect(screen.queryByRole('button', { name: darkestBinName })).toBeNull()
    await showStructure()

    const darkestBin = screen.getByRole('button', { name: darkestBinName })
    await userEvent.hover(darkestBin)
    expect(lastViewerProps(StructureViewer3Dmol).highlightedResidueRanges).toEqual([[1, 2]])
    await userEvent.unhover(darkestBin)
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
    await userEvent.hover(screen.getByRole('button', { name: '1 · o/e 0.05' }))
    expect(lastViewerProps(StructureViewer3Dmol).highlightedResidueRanges).toEqual([[1, 2]])
  })

  test('resets the coloring', async () => {
    render(<TrackInRegionViewer />)
    await showStructure()
    const resetColors = screen.getByRole('button', { name: 'Reset colors' }) as HTMLButtonElement
    expect(resetColors.disabled).toBe(true)

    await userEvent.click(screen.getByLabelText('o/e upper bound'))
    await userEvent.click(screen.getByLabelText('Color non-significant regions'))
    await userEvent.click(screen.getByLabelText('Color unassigned residues'))
    await userEvent.click(resetColors)
    expect((screen.getByLabelText('Missense o/e') as HTMLInputElement).checked).toBe(true)
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
