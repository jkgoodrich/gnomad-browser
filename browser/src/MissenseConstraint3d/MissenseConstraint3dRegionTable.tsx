import React, { useMemo, useState } from 'react'
import styled from 'styled-components'

import { BaseTable, Button } from '@gnomad/ui'

import { logButtonClick } from '../analytics'
import useTableSort, { ColumnSpecifier, numericCompareFunction } from '../useTableSort'
import { regionDescription } from './MissenseConstraint3dRegionAttributes'
import MissenseConstraint3dRegionPlots from './MissenseConstraint3dRegionPlots'
import {
  MissenseConstraint3dRegion,
  RANKED_REGION_MAX_P_VALUE,
  isSignificantRegion,
  plural,
  regionResidues,
} from './missenseConstraint3d'

const SummaryWrapper = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1em;

  button {
    flex-shrink: 0;
  }
`

const TableWrapper = styled.div`
  overflow-x: auto;
`

const Swatch = styled.svg`
  margin-right: 0.5em;
  vertical-align: middle;
`

type RegionRow = {
  region: MissenseConstraint3dRegion
  description: string
  residueCount: number
  segmentCount: number
  firstResidue: number
  lastResidue: number
  obsExp: number
  oeUpper: number
  pValue: number
}

// Significant regions first, then the others, then unassigned residues, each from the lowest o/e.
// The table sorts in descending order first, so the most constrained come first.
const constraintGroup = (region: MissenseConstraint3dRegion) => {
  if (region.is_catch_all) {
    return 0
  }
  return isSignificantRegion(region) ? 2 : 1
}

const COLUMNS: ColumnSpecifier<RegionRow>[] = [
  {
    key: 'description',
    label: 'Region',
    tooltip: null,
    compareValueFunction: (a, b) =>
      constraintGroup(a.region) - constraintGroup(b.region) || b.obsExp - a.obsExp,
  },
  {
    key: 'residueCount',
    label: 'Residues',
    tooltip: 'The number of residues in the region',
    compareValueFunction: numericCompareFunction('residueCount'),
  },
  {
    key: 'segmentCount',
    label: 'Stretches',
    tooltip: 'The number of separate stretches of sequence that the residues form',
    compareValueFunction: numericCompareFunction('segmentCount'),
  },
  {
    key: 'firstResidue',
    label: 'Amino acids',
    tooltip: 'The first and last residues of the region',
    compareValueFunction: numericCompareFunction('firstResidue'),
  },
  {
    key: 'obsExp',
    label: 'Missense o/e',
    tooltip: null,
    compareValueFunction: numericCompareFunction('obsExp'),
  },
  {
    key: 'oeUpper',
    label: 'o/e upper bound',
    tooltip: null,
    compareValueFunction: numericCompareFunction('oeUpper'),
  },
  {
    key: 'pValue',
    label: 'p-value',
    tooltip: null,
    compareValueFunction: numericCompareFunction('pValue'),
  },
]

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  return Number.isInteger(value) ? value : value.toFixed(1)
}

// Like "11-371 residues (median 18)"
const distribution = (values: number[], pluralNoun: string) =>
  `${Math.min(...values)}-${Math.max(...values)} ${pluralNoun} (median ${median(values)})`

const RegionSummary = ({ rows }: { rows: RegionRow[] }) => {
  const regionRows = rows.filter(({ region }) => !region.is_catch_all)
  const unassignedResidueCount = rows
    .filter(({ region }) => region.is_catch_all)
    .reduce((count, { residueCount }) => count + residueCount, 0)
  const residueCounts = regionRows.map(({ residueCount }) => residueCount)
  const segmentCounts = regionRows.map(({ segmentCount }) => segmentCount)
  const significantRegionCount = regionRows.filter(({ region }) =>
    isSignificantRegion(region)
  ).length

  let sizes = ''
  if (regionRows.length === 1) {
    sizes = ` The region has ${plural(residueCounts[0], 'residue')}, in ${plural(
      segmentCounts[0],
      'stretch of sequence',
      'separate stretches of sequence'
    )}.`
  } else if (regionRows.length > 1) {
    sizes = ` Regions have ${distribution(residueCounts, 'residues')}, in ${distribution(
      segmentCounts,
      'separate stretches of sequence'
    )}.`
  }

  return (
    <p>
      {`${plural(
        regionRows.length,
        'region'
      )}, ${significantRegionCount} of them significant (p ≤ ${RANKED_REGION_MAX_P_VALUE.toExponential()}), and ${plural(
        unassignedResidueCount,
        'unassigned residue'
      )}.${sizes}`}
    </p>
  )
}

type Props = {
  regions: MissenseConstraint3dRegion[]
  regionRanks: Map<number, number>
  colorRegion: (region: MissenseConstraint3dRegion) => string
  onHoverRegion: (region: MissenseConstraint3dRegion | null) => void
}

// The size and missense constraint of each 3D region, which can also be plotted
const MissenseConstraint3dRegionTable = ({
  regions,
  regionRanks,
  colorRegion,
  onHoverRegion,
}: Props) => {
  const [arePlotsShown, setArePlotsShown] = useState(false)
  const rows = useMemo(
    () =>
      regions.map((region): RegionRow => {
        const residues = regionResidues(region)
        return {
          region,
          description: regionDescription(region, regionRanks.get(region.region_index)),
          residueCount: residues.length,
          segmentCount: region.segments.length,
          firstResidue: Math.min(...residues),
          lastResidue: Math.max(...residues),
          obsExp: region.obs_exp,
          oeUpper: region.oe_upper,
          pValue: region.p_value,
        }
      }),
    [regions, regionRanks]
  )
  const { headers, sortedRowData } = useTableSort(COLUMNS, 'description', rows)

  return (
    <>
      <SummaryWrapper>
        <RegionSummary rows={rows} />
        <Button
          onClick={() => {
            if (!arePlotsShown) {
              logButtonClick('User showed 3D missense constraint region plots')
            }
            setArePlotsShown(!arePlotsShown)
          }}
        >
          {arePlotsShown ? 'Hide' : 'Show'} plots
        </Button>
      </SummaryWrapper>
      {arePlotsShown && (
        <MissenseConstraint3dRegionPlots
          regions={regions}
          regionRanks={regionRanks}
          onHoverRegion={onHoverRegion}
        />
      )}
      <TableWrapper>
        <BaseTable style={{ minWidth: '100%' }}>
          <thead>
            <tr>{headers}</tr>
          </thead>
          <tbody>
            {sortedRowData.map((row) => (
              <tr
                key={row.region.region_index}
                onMouseEnter={() => onHoverRegion(row.region)}
                onMouseLeave={() => onHoverRegion(null)}
              >
                <th scope="row" style={{ whiteSpace: 'nowrap' }}>
                  <Swatch width={16} height={10}>
                    <rect width={16} height={10} fill={colorRegion(row.region)} stroke="#000" />
                  </Swatch>
                  {row.description}
                </th>
                <td>{row.residueCount}</td>
                <td>{row.segmentCount}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{`${row.firstResidue}-${row.lastResidue}`}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {`${row.obsExp.toFixed(2)} (${row.region.obs_mis}/${row.region.exp_mis.toFixed(
                    1
                  )})`}
                </td>
                <td>{row.oeUpper.toFixed(2)}</td>
                <td>{row.pValue.toExponential(2)}</td>
              </tr>
            ))}
          </tbody>
        </BaseTable>
      </TableWrapper>
    </>
  )
}

export default MissenseConstraint3dRegionTable
