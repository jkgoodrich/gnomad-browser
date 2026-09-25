import React from 'react'
import { jest, describe, expect, test } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegionViewerContext, regionViewerScale } from '@gnomad/region-viewer'

import ConstraintTrack, { regionsInExons, GenericRegion } from './ConstraintTrack'
import { exonFactory } from './__factories__/Gene'
import { Exon } from './TranscriptPage/TranscriptPage'

test('regionsInExons', () => {
  const testCases = [
    {
      regions: [
        { start: 2, stop: 4, i: 1 },
        { start: 6, stop: 8, i: 2 },
      ],
      exons: [exonFactory.build({ start: 2, stop: 6 }), exonFactory.build({ start: 6, stop: 9 })],
      expected: [
        { start: 2, stop: 4, i: 1, unclamped_start: 2, unclamped_stop: 4 },
        { start: 6, stop: 8, i: 2, unclamped_start: 6, unclamped_stop: 8 },
      ],
    },
    {
      regions: [
        { start: 2, stop: 4, i: 1 },
        { start: 6, stop: 8, i: 2 },
      ],
      exons: [exonFactory.build({ start: 1, stop: 8 })],
      expected: [
        { start: 2, stop: 4, i: 1, unclamped_start: 2, unclamped_stop: 4 },
        { start: 6, stop: 8, i: 2, unclamped_start: 6, unclamped_stop: 8 },
      ],
    },
    {
      regions: [
        { start: 2, stop: 4, i: 1 },
        { start: 6, stop: 8, i: 2 },
      ],
      exons: [
        exonFactory.build({ start: 1, stop: 3 }),
        exonFactory.build({ start: 3, stop: 5 }),
        exonFactory.build({ start: 5, stop: 9 }),
      ],
      expected: [
        { start: 2, stop: 3, i: 1, unclamped_start: 2, unclamped_stop: 4 },
        { start: 3, stop: 4, i: 1, unclamped_start: 2, unclamped_stop: 4 },
        { start: 6, stop: 8, i: 2, unclamped_start: 6, unclamped_stop: 8 },
      ],
    },
    {
      regions: [
        { start: 2, stop: 4, misc_field_1: 2, misc_field_2: 4 },
        { start: 6, stop: 8, misc_field_1: 6, misc_field_2: 8 },
      ],
      exons: [
        exonFactory.build({ start: 1, stop: 3 }),
        exonFactory.build({ start: 3, stop: 5 }),
        exonFactory.build({ start: 5, stop: 9 }),
      ],
      expected: [
        {
          start: 2,
          stop: 3,
          misc_field_1: 2,
          misc_field_2: 4,
          unclamped_start: 2,
          unclamped_stop: 4,
        },
        {
          start: 3,
          stop: 4,
          misc_field_1: 2,
          misc_field_2: 4,
          unclamped_start: 2,
          unclamped_stop: 4,
        },
        {
          start: 6,
          stop: 8,
          misc_field_1: 6,
          misc_field_2: 8,
          unclamped_start: 6,
          unclamped_stop: 8,
        },
      ],
    },
  ]

  testCases.forEach(({ regions, exons, expected }) => {
    expect(regionsInExons(regions as GenericRegion[], exons as Exon[])).toEqual(expected)
  })
})

describe('ConstraintTrack', () => {
  const viewerRegions = [{ start: 0, stop: 100 }]
  const region = { start: 10, stop: 20, unclamped_start: 10, unclamped_stop: 20 }

  const renderTrack = (props: Partial<React.ComponentProps<typeof ConstraintTrack>>) =>
    render(
      <RegionViewerContext.Provider
        value={{
          centerPanelWidth: 500,
          isPositionDefined: () => true,
          leftPanelWidth: 100,
          regions: viewerRegions,
          rightPanelWidth: 100,
          scalePosition: regionViewerScale(viewerRegions, [0, 500]),
        }}
      >
        <ConstraintTrack
          trackTitle="Test constraint"
          allRegions={null}
          constrainedRegions={[region]}
          infobuttonTopic="constraint"
          legend={null}
          tooltipComponent={() => null}
          colorFn={() => 'red'}
          valueFn={() => ''}
          {...props}
        />
      </RegionViewerContext.Provider>
    )

  test('shows a control under the track title', () => {
    renderTrack({ leftPanelControl: <button type="button">Track control</button> })
    expect(screen.getByRole('button', { name: 'Track control' })).not.toBeNull()
  })

  test('reports the region under the cursor', async () => {
    const onHoverRegion = jest.fn()
    const { container } = renderTrack({ onHoverRegion })
    const regionRect = container.querySelector('rect[fill="red"]')!

    await userEvent.hover(regionRect)
    expect(onHoverRegion).toHaveBeenLastCalledWith(region)

    await userEvent.unhover(regionRect)
    expect(onHoverRegion).toHaveBeenLastCalledWith(null)
  })
})
