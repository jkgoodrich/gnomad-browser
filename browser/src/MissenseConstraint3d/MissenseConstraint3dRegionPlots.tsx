import { scaleLinear, scaleLog } from 'd3-scale'
import React, { useMemo } from 'react'
import { withSize } from 'react-sizeme'
import styled from 'styled-components'
import { AxisBottom, AxisLeft } from '@visx/axis'

import { TooltipAnchor } from '@gnomad/ui'

import { RegionAttributeList } from '../ConstraintTrack'
import Legend from '../Legend'
import StackedHistogram from '../StackedHistogram'
import MissenseConstraint3dRegionAttributes from './MissenseConstraint3dRegionAttributes'
import {
  COUNT_BIN_EDGES,
  MissenseConstraint3dRegion,
  NO_REGION_COLOR,
  RANKED_REGION_MAX_P_VALUE,
  UNASSIGNED_RESIDUE_FILL,
  binByCount,
  isSignificantRegion,
  plural,
  regionResidues,
} from './missenseConstraint3d'

const SIGNIFICANT_REGION_COLOR = '#428bca'

const P_VALUE = RANKED_REGION_MAX_P_VALUE.toExponential()

const PLOT_HEIGHT = 250

type RegionPoint = {
  region: MissenseConstraint3dRegion
  rank: number | undefined
  residueCount: number
}

const PlotsWrapper = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0 2em;
  margin-bottom: 1em;
`

const HistogramWrapper = styled.div`
  flex: 1 1 250px;
  min-width: 0;
`

const ObsExpPlotWrapper = styled.div`
  flex: 2 1 400px;
  min-width: 0;
`

// The plot is sized to fit this, which fills its container
const ObsExpPlotSizer = styled.div`
  overflow: hidden;
  width: 100%;
`

type RegionHistogramProps = {
  id: string
  points: RegionPoint[]
  count: (point: RegionPoint) => number
  xLabel: string
  // What is counted, in the singular and plural
  countNouns: [string, string]
}

// The numbers of significant and other regions in each bin of a count
const RegionHistogram = ({
  id,
  points,
  count,
  xLabel,
  countNouns: [singular, pluralForm],
}: RegionHistogramProps) => {
  const bins = binByCount(points, count)
  return (
    <StackedHistogram
      // @ts-expect-error StackedHistogram's sized export doesn't pass on the types of its props
      id={id}
      bins={bins.map(({ label }) => label)}
      values={bins.map(({ items }) => {
        const significantCount = items.filter(({ region }) => isSignificantRegion(region)).length
        return [significantCount, items.length - significantCount]
      })}
      barColors={[SIGNIFICANT_REGION_COLOR, NO_REGION_COLOR]}
      height={PLOT_HEIGHT}
      xLabel={xLabel}
      yLabel="Regions"
      formatTooltip={(bin: string, [significantCount, otherCount]: number[]) =>
        `${bin} ${bin === '1' ? singular : pluralForm}: ${plural(
          significantCount + otherCount,
          'region'
        )}, ${significantCount} significant`
      }
    />
  )
}

const OBS_EXP_PLOT_MARGIN = { top: 10, right: 20, bottom: 50, left: 60 }
// Wide enough for the axes in a narrow window
const MIN_OBS_EXP_PLOT_WIDTH = 300
const POINT_RADIUS = 5

const AXIS_LABEL_PROPS = { fontSize: 14, textAnchor: 'middle' } as const

const RegionPointTooltip = ({ point: { region, rank, residueCount } }: { point: RegionPoint }) => (
  <RegionAttributeList>
    <MissenseConstraint3dRegionAttributes region={region} rank={rank} />
    <div>
      <dt>Residues:</dt>
      <dd>
        {`${residueCount}, in ${plural(
          region.segments.length,
          'stretch of sequence',
          'separate stretches of sequence'
        )}`}
      </dd>
    </div>
  </RegionAttributeList>
)

type RegionObsExpPlotProps = {
  points: RegionPoint[]
  allResiduesObsExp: number
  onHoverRegion: (region: MissenseConstraint3dRegion | null) => void
  size: { width: number | null }
}

// Each region's missense o/e, with a line up to its upper bound, by the number of its residues
const RegionObsExpPlot = withSize()(
  ({ points, allResiduesObsExp, onHoverRegion, size }: RegionObsExpPlotProps) => {
    const width = Math.max(size.width || 0, MIN_OBS_EXP_PLOT_WIDTH)
    const plotWidth = width - OBS_EXP_PLOT_MARGIN.left - OBS_EXP_PLOT_MARGIN.right
    const plotHeight = PLOT_HEIGHT - OBS_EXP_PLOT_MARGIN.top - OBS_EXP_PLOT_MARGIN.bottom

    // Regions' sizes span orders of magnitude
    const residueCounts = points.map(({ residueCount }) => residueCount)
    const xScale = scaleLog()
      .domain([Math.min(...residueCounts) / 1.25, Math.max(...residueCounts) * 1.25])
      .range([0, plotWidth])
    const [minResidueCount, maxResidueCount] = xScale.domain()
    const yScale = scaleLinear()
      .domain([0, Math.max(1, ...points.map(({ region }) => region.oe_upper))])
      .nice()
      .range([plotHeight, 0])
    const allResiduesY = yScale(allResiduesObsExp)

    // Significant regions are drawn over the others
    const sortedPoints = [...points].sort(
      (a, b) => Number(isSignificantRegion(a.region)) - Number(isSignificantRegion(b.region))
    )

    return (
      <ObsExpPlotSizer>
        <svg width={width} height={PLOT_HEIGHT}>
          <AxisBottom
            label="Residues in region"
            labelProps={AXIS_LABEL_PROPS}
            left={OBS_EXP_PLOT_MARGIN.left}
            top={OBS_EXP_PLOT_MARGIN.top + plotHeight}
            scale={xScale}
            stroke="#333"
            tickFormat={(residueCount) => `${residueCount}`}
            tickValues={COUNT_BIN_EDGES.filter(
              (edge) => edge >= minResidueCount && edge <= maxResidueCount
            )}
          />
          <AxisLeft
            label="Missense o/e"
            labelProps={AXIS_LABEL_PROPS}
            left={OBS_EXP_PLOT_MARGIN.left}
            top={OBS_EXP_PLOT_MARGIN.top}
            scale={yScale}
            stroke="#333"
          />
          <g transform={`translate(${OBS_EXP_PLOT_MARGIN.left},${OBS_EXP_PLOT_MARGIN.top})`}>
            <line
              x1={0}
              x2={plotWidth}
              y1={allResiduesY}
              y2={allResiduesY}
              stroke="#333"
              strokeDasharray="4 4"
            />
            <text x={plotWidth} y={allResiduesY - 4} fontSize={12} textAnchor="end">
              {`All residues: ${allResiduesObsExp.toFixed(2)}`}
            </text>
            {sortedPoints.map((point) => {
              const { region, rank, residueCount } = point
              const x = xScale(residueCount)
              const y = yScale(region.obs_exp)
              const upperY = yScale(region.oe_upper)
              return (
                <TooltipAnchor
                  key={region.region_index}
                  // @ts-expect-error need to redefine TooltipAnchor to allow arbitrary props for the children type-safely
                  point={point}
                  tooltipComponent={RegionPointTooltip}
                >
                  <g>
                    {/* Hover handlers go on an inner group because TooltipAnchor replaces its child's */}
                    <g
                      onMouseEnter={() => onHoverRegion(region)}
                      onMouseLeave={() => onHoverRegion(null)}
                    >
                      <line x1={x} x2={x} y1={y} y2={upperY} stroke="#333" />
                      <line x1={x - 3} x2={x + 3} y1={upperY} y2={upperY} stroke="#333" />
                      {region.is_catch_all ? (
                        <rect
                          x={x - POINT_RADIUS}
                          y={y - POINT_RADIUS}
                          width={2 * POINT_RADIUS}
                          height={2 * POINT_RADIUS}
                          fill={UNASSIGNED_RESIDUE_FILL}
                          stroke="#333"
                        />
                      ) : (
                        <circle
                          cx={x}
                          cy={y}
                          r={POINT_RADIUS}
                          fill={
                            isSignificantRegion(region) ? SIGNIFICANT_REGION_COLOR : NO_REGION_COLOR
                          }
                          stroke="#333"
                        />
                      )}
                      {rank !== undefined && (
                        <text x={x + POINT_RADIUS + 2} y={y} dy="0.33em" fontSize={11}>
                          {rank + 1}
                        </text>
                      )}
                    </g>
                  </g>
                </TooltipAnchor>
              )
            })}
          </g>
        </svg>
      </ObsExpPlotSizer>
    )
  }
)

type Props = {
  regions: MissenseConstraint3dRegion[]
  regionRanks: Map<number, number>
  onHoverRegion: (region: MissenseConstraint3dRegion | null) => void
}

// The sizes of the 3D regions and their missense constraint
const MissenseConstraint3dRegionPlots = ({ regions, regionRanks, onHoverRegion }: Props) => {
  const points = useMemo(
    () =>
      regions.map(
        (region): RegionPoint => ({
          region,
          rank: regionRanks.get(region.region_index),
          residueCount: regionResidues(region).length,
        })
      ),
    [regions, regionRanks]
  )
  const regionPoints = points.filter(({ region }) => !region.is_catch_all)
  // The regions and unassigned residues cover the whole protein
  const allResiduesObsExp =
    regions.reduce((total, region) => total + region.obs_mis, 0) /
    regions.reduce((total, region) => total + region.exp_mis, 0)

  return (
    <>
      <Legend
        series={[
          { label: `Significant (p ≤ ${P_VALUE})`, color: SIGNIFICANT_REGION_COLOR },
          { label: `Not significant (p > ${P_VALUE})`, color: NO_REGION_COLOR },
          { label: 'Unassigned residues', color: UNASSIGNED_RESIDUE_FILL },
        ]}
      />
      <PlotsWrapper>
        <HistogramWrapper>
          <h3>Residues per region</h3>
          <RegionHistogram
            id="missense-constraint-3d-region-residues"
            points={regionPoints}
            count={({ residueCount }) => residueCount}
            xLabel="Residues"
            countNouns={['residue', 'residues']}
          />
        </HistogramWrapper>
        <HistogramWrapper>
          <h3>Stretches of sequence per region</h3>
          <RegionHistogram
            id="missense-constraint-3d-region-stretches"
            points={regionPoints}
            count={({ region }) => region.segments.length}
            xLabel="Separate stretches of sequence"
            countNouns={['stretch', 'stretches']}
          />
        </HistogramWrapper>
        <ObsExpPlotWrapper>
          <h3>Missense o/e by region size</h3>
          <RegionObsExpPlot
            points={points}
            allResiduesObsExp={allResiduesObsExp}
            onHoverRegion={onHoverRegion}
          />
        </ObsExpPlotWrapper>
      </PlotsWrapper>
    </>
  )
}

export default MissenseConstraint3dRegionPlots
