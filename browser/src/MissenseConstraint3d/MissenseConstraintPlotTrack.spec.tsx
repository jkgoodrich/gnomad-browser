import { describe, expect, test } from '@jest/globals'

import { plotIntervals, stepLinePath } from './MissenseConstraintPlotTrack'

describe('stepLinePath', () => {
  test('steps between adjacent segments and breaks between others', () => {
    const segments = [
      { start: 10, stop: 12, value: 0.2 },
      { start: 1, stop: 2, value: 0.5 },
      { start: 3, stop: 4, value: 1 },
    ]
    expect(
      stepLinePath(
        segments,
        (position) => position * 10,
        (value) => value * 100
      )
    ).toBe('M10,50H20L30,100H40M100,20H120')
  })
})

describe('plotIntervals', () => {
  test('splits the genome where either kind of region starts or stops', () => {
    const first = { start: 1, stop: 4 }
    const second = { start: 3, stop: 6 }
    const elsewhere = { start: 10, stop: 10 }
    expect(plotIntervals([first, elsewhere], [second])).toEqual([
      { start: 1, stop: 2, first, second: undefined },
      { start: 3, stop: 4, first, second },
      { start: 5, stop: 6, first: undefined, second },
      { start: 10, stop: 10, first: elsewhere, second: undefined },
    ])
  })
})
