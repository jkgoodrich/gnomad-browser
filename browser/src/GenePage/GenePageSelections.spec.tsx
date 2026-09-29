import React from 'react'
import { expect, test } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  GenePageSelectionsProvider,
  useClinvarTrackFilter,
  useVariantTableFilter,
} from './GenePageSelections'

// Like the variant table and the 3D missense constraint structure's legend, which both search the
// table's variants
const VariantTableSearch = ({ label }: { label: string }) => {
  const { filter, onChangeFilter } = useVariantTableFilter()!
  return (
    <input
      aria-label={label}
      value={filter.searchText}
      onChange={(event) => onChangeFilter({ ...filter, searchText: event.target.value })}
    />
  )
}

// Like the ClinVar track and the 3D missense constraint structure's legend, which both filter the
// track's variants by review status
const ClinvarTrackStars = ({ label }: { label: string }) => {
  const { filter, onChangeFilter } = useClinvarTrackFilter()!
  return (
    <button type="button" onClick={() => onChangeFilter({ ...filter, starFilter: 2 })}>
      {`${label}: ${filter.starFilter}`}
    </button>
  )
}

test('sections of the gene page share the filters of the variant table and ClinVar track', async () => {
  render(
    <GenePageSelectionsProvider>
      <VariantTableSearch label="Table search" />
      <VariantTableSearch label="Legend search" />
      <ClinvarTrackStars label="Track stars" />
      <ClinvarTrackStars label="Legend stars" />
    </GenePageSelectionsProvider>
  )

  await userEvent.type(screen.getByLabelText('Legend search'), 'rs1')
  expect((screen.getByLabelText('Table search') as HTMLInputElement).value).toBe('rs1')

  await userEvent.click(screen.getByRole('button', { name: 'Track stars: 0' }))
  expect(screen.getByRole('button', { name: 'Legend stars: 2' })).not.toBeNull()
})

test('filters are only shared on the gene page', () => {
  const SharedFilters = () => {
    const variantTableFilter = useVariantTableFilter()
    const clinvarTrackFilter = useClinvarTrackFilter()
    return <output>{`${variantTableFilter} ${clinvarTrackFilter}`}</output>
  }
  render(<SharedFilters />)
  expect(screen.getByRole('status').textContent).toBe('undefined undefined')
})
