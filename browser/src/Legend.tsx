import React from 'react'
import styled from 'styled-components'

const LegendWrapper = styled.ul`
  display: flex;
  flex-wrap: wrap;
  flex-direction: row;
  padding: 0;
  margin: 0 1em 0 0;
  list-style-type: none;
`

const LegendItem = styled.li`
  display: flex;
  margin: 0 1em 0.33em 0;
`

type LegendSwatchProps = {
  color: string
}

const LegendSwatch = ({ color }: LegendSwatchProps) => (
  <svg width={16} height={16}>
    <rect x={0} y={0} height={16} width={16} fill={color} stroke="#000" />
  </svg>
)

export type SeriesLegendProps = {
  color?: string
  label: string
  swatch?: React.ReactNode
}

// Reports the fill of an interactive legend entry that is hovered, focused or clicked
export type LegendInteraction = {
  onHoverFill: (fill: string | null) => void
  onClickFill: (fill: string) => void
}

// Makes a legend entry, identified by its fill, work like a button
export const legendEntryProps = (
  fill: string,
  label: string,
  { onHoverFill, onClickFill }: LegendInteraction
) => ({
  role: 'button',
  tabIndex: 0,
  'aria-label': label,
  style: { cursor: 'pointer' },
  onMouseEnter: () => onHoverFill(fill),
  onMouseLeave: () => onHoverFill(null),
  onFocus: () => onHoverFill(fill),
  onBlur: () => onHoverFill(null),
  onClick: () => onClickFill(fill),
  onKeyDown: (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClickFill(fill)
    }
  },
})

const InteractiveLegendEntry = styled.span`
  display: flex;
`

type LegendProps = {
  series: SeriesLegendProps[]
  // Makes the entries with a color interactive
  interaction?: LegendInteraction
}

const Legend = ({ series, interaction }: LegendProps) => (
  <LegendWrapper>
    {series.map(({ color, label, swatch }) => {
      const entry = (
        <>
          {color ? <LegendSwatch color={color} /> : swatch}
          <span style={{ marginLeft: '0.25em' }}>{label}</span>
        </>
      )
      return (
        <LegendItem key={label}>
          {interaction && color ? (
            <InteractiveLegendEntry {...legendEntryProps(color, label, interaction)}>
              {entry}
            </InteractiveLegendEntry>
          ) : (
            entry
          )}
        </LegendItem>
      )
    })}
  </LegendWrapper>
)

export default Legend

type StripedSwatchProps = {
  id: string
  color: string
}

export const StripedSwatch = ({ id, color }: StripedSwatchProps) => (
  <svg width={16} height={16}>
    <defs>
      <pattern
        id={`${id}-stripes`}
        width={4}
        height={4}
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width={3} height={4} transform="translate(0,0)" fill="#fff" />
      </pattern>
      <mask id={`${id}-mask`}>
        <rect x={0} y={0} width="100%" height="100%" fill={`url(#${id}-stripes)`} />
      </mask>
    </defs>
    <rect x={0} y={0} width={16} height={16} fill={color} mask={`url(#${id}-mask)`} />
    <rect x={0} y={0} width={16} height={16} fill="none" stroke="#333" />
  </svg>
)
