import React from 'react'
import renderer from 'react-test-renderer'
import { jest, describe, expect, test, beforeEach, afterEach } from '@jest/globals'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  StructureViewerProps,
  alphafoldStructureUrl,
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

// jsdom has no WebGL
jest.mock('./StructureViewer3Dmol', () => ({ __esModule: true, default: jest.fn(() => null) }))
jest.mock('./StructureViewerMolstar', () => ({ __esModule: true, default: jest.fn(() => null) }))

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
        exome: { ac: 1, an: 100, filters: [] },
        genome: null,
      },
      {
        variant_id: '12-201-G-A',
        consequence: 'missense_variant',
        hgvsp: 'p.Gly2Asp',
        exome: { ac: 1, an: 100, filters: [] },
        genome: null,
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
}) => (
  <RegionViewerContext.Provider value={regionViewer}>
    <MissenseConstraint3dTrack datasetId="gnomad_r4" gene={gene} {...props} />
  </RegionViewerContext.Provider>
)

const lastViewerProps = (viewer: unknown) => {
  const { calls } = (viewer as jest.Mock).mock
  return calls[calls.length - 1][0] as StructureViewerProps
}

const trackRegionFills = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('rect[stroke="black"]'), (rect) =>
    rect.getAttribute('fill')
  )

const showStructure = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Show structure' }))
  await waitFor(() => expect(StructureViewer3Dmol).toHaveBeenCalled())
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
      NO_REGION_COLOR,
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

    await userEvent.click(screen.getByLabelText('Color catch-all region'))
    expect(trackRegionFills(container)).toContain(missenseObsExpColorScale.lightest)
    expect(lastViewerProps(StructureViewer3Dmol).residueColors[4]).toBe(
      missenseObsExpColorScale.lightest
    )
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

  test('shows variants and UniProt features on the structure', async () => {
    render(<TrackInRegionViewer />)
    await showStructure()

    expect(screen.getByText(/1 missense variant could not be placed/)).not.toBeNull()
    expect(
      screen.getByLabelText('ClinVar pathogenic / likely pathogenic missense (1)')
    ).not.toBeNull()
    expect(screen.getByLabelText('Transmembrane (1)')).not.toBeNull()

    await userEvent.click(screen.getByLabelText('gnomAD missense variants (1)'))
    expect(
      lastViewerProps(StructureViewer3Dmol).overlays.map(({ id, residueRanges }) => [
        id,
        residueRanges,
      ])
    ).toEqual([['gnomad-missense', [[2, 2]]]])
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
  })

  test('can show the structure with either viewer library', async () => {
    render(<TrackInRegionViewer />)
    await showStructure()

    await userEvent.click(screen.getByLabelText('Mol*'))
    await waitFor(() => expect(StructureViewerMolstar).toHaveBeenCalled())
  })
})
