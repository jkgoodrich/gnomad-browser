import React from 'react'

import { Badge, TextButton } from '@gnomad/ui'

// Limits a list of variants to some positions, like those encoding residues selected on the 3D
// missense constraint structure
export type PositionFilter = {
  intervals: { start: number; stop: number }[]
  // Completes "Showing only variants in ..."
  description: string
  onClear: () => void
}

export const variantsInPositionFilter = <V extends { pos: number }>(
  variants: V[],
  positionFilter: PositionFilter | null | undefined
) =>
  positionFilter
    ? variants.filter((variant) =>
        positionFilter.intervals.some(
          ({ start, stop }) => start <= variant.pos && variant.pos <= stop
        )
      )
    : variants

export const PositionFilterNotice = ({ positionFilter }: { positionFilter: PositionFilter }) => (
  <p>
    <Badge level="info">Note</Badge> Showing only variants in {positionFilter.description}.{' '}
    <TextButton onClick={positionFilter.onClear}>Show all variants</TextButton>
  </p>
)
