import React from 'react'
import { describe, it, expect, jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegionViewerContext, regionViewerScale } from '@gnomad/region-viewer'
import { Variant } from '../VariantPage/VariantPage'
import geneFactory from '../__factories__/Gene'
import { v2VariantFactory, variantTableVariantFactory } from '../__factories__/Variant'
import Variants, { getFirstIndexFromSearchText } from './Variants'

// The track draws on a canvas and the table's grid needs a react-sizeme component, neither of
// which the test environment provides
jest.mock('./VariantTrack', () => ({ __esModule: true, default: () => null }))
jest.mock('./VariantTable', () => {
  const { forwardRef } = jest.requireActual<typeof React>('react')
  return { __esModule: true, default: forwardRef(() => null) }
})

describe('getFirstIndexFromSearchText', () => {
  const mockVariantsSearched: Variant[] = []

  for (let i = 0; i < 50; i += 1) {
    mockVariantsSearched[i] = v2VariantFactory.build({ variant_id: `example${i}`, pos: i })
  }

  const mockVariantsTableColumns = [
    {
      key: 'variant_id',
      heading: 'Variant ID',
      description: 'Chromosome-position-reference-alternate',
      isRowHeader: true,
      minWidth: 150,
      grow: 1,
      compareFunction: () => 1,
      getSearchTerms: (variant: any) => [variant.variant_id].concat(variant.rsids || []),
      render: () => 1,
    },
  ]

  it('returns expected index when searchedVariants has length > 0 and firstIndex > visibleVariantWindow[0]', () => {
    const mockSearchFilter = {
      includeCategories: {
        lof: true,
        missense: true,
        synonymous: true,
        other: true,
      },
      includeFilteredVariants: false,
      includeSNVs: true,
      includeIndels: true,
      includeExomes: true,
      includeGenomes: true,
      includeContext: true,
      searchText: 'example35',
    }

    const mockVisibleVariantWindow = [0, 19]

    expect(
      getFirstIndexFromSearchText(
        mockSearchFilter,
        mockVariantsSearched,
        mockVariantsTableColumns,
        mockVisibleVariantWindow
      )
    ).toBe(45)
  })

  it('returns expected index when searchedVariants has length > 0 and firstIndex < visibleVariantWindow[0]', () => {
    const mockSearchFilter = {
      includeCategories: {
        lof: true,
        missense: true,
        synonymous: true,
        other: true,
      },
      includeFilteredVariants: false,
      includeSNVs: true,
      includeIndels: true,
      includeExomes: true,
      includeGenomes: true,
      includeContext: true,
      searchText: 'example16',
    }

    const mockVisibleVariantWindow = [20, 39]

    expect(
      getFirstIndexFromSearchText(
        mockSearchFilter,
        mockVariantsSearched,
        mockVariantsTableColumns,
        mockVisibleVariantWindow
      )
    ).toBe(6)
  })

  it('returns expected index when searchedVariants has length of 0, no results found', () => {
    const mockSearchFilter = {
      includeCategories: {
        lof: true,
        missense: true,
        synonymous: true,
        other: true,
      },
      includeFilteredVariants: false,
      includeSNVs: true,
      includeIndels: true,
      includeExomes: true,
      includeGenomes: true,
      includeContext: true,
      searchText: '1234',
    }

    const mockVisibleVariantWindow = [0, 19]

    expect(
      getFirstIndexFromSearchText(
        mockSearchFilter,
        mockVariantsSearched,
        mockVariantsTableColumns,
        mockVisibleVariantWindow
      )
    ).toBe(0)
  })
})

describe('Variants', () => {
  const viewerRegions = [{ start: 1, stop: 1000 }]
  const regionViewer = {
    centerPanelWidth: 500,
    isPositionDefined: () => true,
    leftPanelWidth: 100,
    regions: viewerRegions,
    rightPanelWidth: 100,
    scalePosition: regionViewerScale(viewerRegions, [0, 500]),
  }

  it('reports the variants that the table lists', async () => {
    const variants = [
      variantTableVariantFactory.build({
        variant_id: '1-100-A-C',
        pos: 100,
        consequence: 'missense_variant',
      }),
      variantTableVariantFactory.build({
        variant_id: '1-200-A-C',
        pos: 200,
        consequence: 'synonymous_variant',
      }),
    ] as unknown as Variant[]
    const onChangeFilteredVariants = jest.fn<(variants: Variant[]) => void>()
    const reportedVariantIds = () => {
      const { calls } = onChangeFilteredVariants.mock
      return calls[calls.length - 1][0].map((variant) => variant.variant_id)
    }

    render(
      <RegionViewerContext.Provider value={regionViewer}>
        <Variants
          clinvarReleaseDate="2022-10-31"
          context={geneFactory.build()}
          datasetId="gnomad_r4"
          variants={variants}
          onChangeFilteredVariants={onChangeFilteredVariants}
        />
      </RegionViewerContext.Provider>
    )
    expect(reportedVariantIds()).toEqual(['1-100-A-C', '1-200-A-C'])

    await userEvent.click(screen.getByLabelText(/^Synonymous/))
    expect(reportedVariantIds()).toEqual(['1-100-A-C'])
  })
})
