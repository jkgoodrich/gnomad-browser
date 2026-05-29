import { predictNmdRegion, nmdEscapeReasonAtPosition } from './nmdRegion'

const cds = (start: number, stop: number) => ({ feature_type: 'CDS', start, stop })
const utr = (start: number, stop: number) => ({ feature_type: 'UTR', start, stop })

const sumLen = (rs: { start: number; stop: number }[]) =>
  rs.reduce((acc, r) => acc + (r.stop - r.start + 1), 0)

describe('predictNmdRegion', () => {
  describe('forward-strand multi-CDS-exon transcript', () => {
    // First CDS exon is 500 bp (>100 and >400), penultimate is 200 bp (>50), last is 300 bp.
    // Expected escape (union of 4 rules, higher priority wins on overlap):
    //   - first 100 bp of CDS = [1001, 1100] (start-proximal)
    //   - rest of the 500 bp first exon = [1101, 1500] (long-exon, >400 bp)
    //   - 50 bp at 3'-end of penultimate = [2151, 2200] (last-junction-50bp)
    //   - entire last exon = [3001, 3300] (last-junction-50bp)
    // Expected sensitive (CDS minus escape):
    //   - first part of penultimate = [2001, 2150]
    const transcript = {
      strand: '+' as const,
      exons: [cds(1001, 1500), cds(2001, 2200), cds(3001, 3300), utr(501, 1000)],
    }
    const result = predictNmdRegion(transcript)

    it('returns multi-exon-50bp rationale', () => {
      expect(result.rationale).toBe('multi-exon-50bp')
    })

    it('places the entire last CDS exon in NMD-escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 3001,
        stop: 3300,
        reason: 'last-junction-50bp',
      })
    })

    it('places the 50 bp at the 3-prime end of the penultimate exon in NMD-escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 2151,
        stop: 2200,
        reason: 'last-junction-50bp',
      })
    })

    it('places the first 100 bp of CDS in NMD-escape (start-proximal rule)', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 1001,
        stop: 1100,
        reason: 'start-proximal',
      })
    })

    it('places the rest of the penultimate exon in NMD-sensitive', () => {
      expect(result.nmdSensitiveRegions).toContainEqual({ start: 2001, stop: 2150 })
    })

    it('places the rest of the long first exon in NMD-escape (long-exon rule)', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 1101,
        stop: 1500,
        reason: 'long-exon',
      })
    })

    it('ignores UTR exons', () => {
      const allCoords = [...result.nmdSensitiveRegions, ...result.nmdEscapeRegions]
      expect(allCoords.every((r) => r.start >= 1001 && r.stop <= 3300)).toBe(true)
    })

    it('NMD-sensitive and NMD-escape spans together cover the full CDS without overlap', () => {
      const totalCdsLen = 500 + 200 + 300
      expect(sumLen(result.nmdSensitiveRegions) + sumLen(result.nmdEscapeRegions)).toBe(totalCdsLen)
    })
  })

  describe('reverse-strand multi-CDS-exon transcript', () => {
    // On - strand, transcript order is descending genomic coordinate.
    // CDS exons (genomic): [1001, 1100] (100 bp), [2001, 2200] (200 bp), [3001, 3300] (300 bp).
    // Transcript order: 3001-3300 first (5'), then 2001-2200, then 1001-1100 last (3').
    // Expected escape:
    //   - first 100 bp of CDS = top 100 bp of {3001,3300} = [3201, 3300]
    //   - 50 bp at 3'-end of penultimate {2001,2200} (transcript 3' = low genomic) = [2001, 2050]
    //   - entire last CDS exon = [1001, 1100]
    // Expected sensitive:
    //   - rest of first CDS exon = [3001, 3200]
    //   - rest of penultimate = [2051, 2200]
    const transcript = {
      strand: '-' as const,
      exons: [cds(1001, 1100), cds(2001, 2200), cds(3001, 3300)],
    }
    const result = predictNmdRegion(transcript)

    it('returns multi-exon-50bp rationale', () => {
      expect(result.rationale).toBe('multi-exon-50bp')
    })

    it('places the entire last CDS exon (smallest genomic coords) in NMD-escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 1001,
        stop: 1100,
        reason: 'last-junction-50bp',
      })
    })

    it('places the 50 bp at the 3-prime end of the penultimate exon in NMD-escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 2001,
        stop: 2050,
        reason: 'last-junction-50bp',
      })
    })

    it('places the first 100 bp of CDS (highest genomic coords) in NMD-escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 3201,
        stop: 3300,
        reason: 'start-proximal',
      })
    })

    it('places the post-start-proximal portion of the first CDS exon in NMD-sensitive', () => {
      expect(result.nmdSensitiveRegions).toContainEqual({ start: 3001, stop: 3200 })
    })

    it('places the rest of the penultimate exon in NMD-sensitive', () => {
      expect(result.nmdSensitiveRegions).toContainEqual({ start: 2051, stop: 2200 })
    })

    it('NMD-sensitive and NMD-escape spans together cover the full CDS without overlap', () => {
      const totalCdsLen = 100 + 200 + 300
      expect(sumLen(result.nmdSensitiveRegions) + sumLen(result.nmdEscapeRegions)).toBe(totalCdsLen)
    })
  })

  describe('start-proximal escape spilling into exon 2 (forward strand)', () => {
    // First CDS exon is only 50 bp, so start-proximal escape consumes the full
    // first exon plus 50 bp of the second CDS exon.
    // Expected escape:
    //   - entire first exon [1001, 1050]
    //   - first 50 bp of second exon [2001, 2050]
    //   - 50 bp at 3'-end of penultimate [2151, 2200]
    //   - entire last exon [3001, 3300]
    // Expected sensitive: middle of penultimate = [2051, 2150]
    const transcript = {
      strand: '+' as const,
      exons: [cds(1001, 1050), cds(2001, 2200), cds(3001, 3300)],
    }
    const result = predictNmdRegion(transcript)

    it('absorbs the full first exon into NMD-escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 1001,
        stop: 1050,
        reason: 'start-proximal',
      })
    })

    it('extends start-proximal escape into the second exon', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 2001,
        stop: 2050,
        reason: 'start-proximal',
      })
    })

    it('leaves the middle of the penultimate exon NMD-sensitive', () => {
      expect(result.nmdSensitiveRegions).toContainEqual({ start: 2051, stop: 2150 })
    })

    it('NMD-sensitive and NMD-escape spans together cover the full CDS without overlap', () => {
      const totalCdsLen = 50 + 200 + 300
      expect(sumLen(result.nmdSensitiveRegions) + sumLen(result.nmdEscapeRegions)).toBe(totalCdsLen)
    })
  })

  describe('start-proximal escape spilling into exon 2 (reverse strand)', () => {
    // First-in-transcript CDS exon on - strand = largest genomic coords.
    // {3001, 3030} is the first-in-transcript exon, only 30 bp long.
    // Start-proximal escape: entire {3001,3030} + 70 bp from next exon (transcript order).
    // Next exon in transcript order = {2001, 2200}, its 5' end (transcript) = high genomic coord.
    // So 70 bp from its 5' end = [2131, 2200].
    const transcript = {
      strand: '-' as const,
      exons: [cds(1001, 1100), cds(2001, 2200), cds(3001, 3030)],
    }
    const result = predictNmdRegion(transcript)

    it('absorbs the full first-in-transcript exon (highest coords) into NMD-escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 3001,
        stop: 3030,
        reason: 'start-proximal',
      })
    })

    it('extends start-proximal escape into the 5-prime end of the next exon', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 2131,
        stop: 2200,
        reason: 'start-proximal',
      })
    })

    it('keeps the entire last CDS exon (lowest coords) in NMD-escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 1001,
        stop: 1100,
        reason: 'last-junction-50bp',
      })
    })
  })

  describe('single-coding-exon transcript', () => {
    const transcript = {
      strand: '+' as const,
      exons: [cds(1001, 1500), utr(501, 1000), utr(1501, 1800)],
    }
    const result = predictNmdRegion(transcript)

    it('returns single-coding-exon rationale', () => {
      expect(result.rationale).toBe('single-coding-exon')
    })

    it('marks the entire CDS as NMD-escape with no NMD-sensitive region', () => {
      expect(result.nmdEscapeRegions).toEqual([
        { start: 1001, stop: 1500, reason: 'single-coding-exon' },
      ])
      expect(result.nmdSensitiveRegions).toEqual([])
    })
  })

  describe('transcript without a CDS', () => {
    const transcript = {
      strand: '+' as const,
      exons: [{ feature_type: 'exon', start: 1, stop: 100 }],
    }
    const result = predictNmdRegion(transcript)

    it('returns no-cds rationale', () => {
      expect(result.rationale).toBe('no-cds')
    })

    it('produces no NMD intervals', () => {
      expect(result.nmdEscapeRegions).toEqual([])
      expect(result.nmdSensitiveRegions).toEqual([])
    })
  })

  describe('penultimate CDS exon shorter than 50 bp (forward strand)', () => {
    // 3' escape walks past the 20 bp penultimate exon into 30 bp of the first exon.
    // 5' start-proximal escape eats the first 100 bp of the first exon.
    // The 500 bp first exon is >400 bp, so the long-exon rule claims its middle
    // [1101, 1470], leaving no NMD-sensitive bases.
    const transcript = {
      strand: '+' as const,
      exons: [cds(1001, 1500), cds(2001, 2020), cds(3001, 3300)],
    }
    const result = predictNmdRegion(transcript)

    it('absorbs the full penultimate exon into NMD-escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 2001,
        stop: 2020,
        reason: 'last-junction-50bp',
      })
    })

    it('extends 3-prime escape 30 bp into the next-upstream CDS exon', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 1471,
        stop: 1500,
        reason: 'last-junction-50bp',
      })
    })

    it('also marks the first 100 bp of the first exon as escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 1001,
        stop: 1100,
        reason: 'start-proximal',
      })
    })

    it('claims the middle of the long first exon as long-exon escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 1101,
        stop: 1470,
        reason: 'long-exon',
      })
      expect(result.nmdSensitiveRegions).toEqual([])
    })

    it('keeps the last CDS exon entirely in NMD-escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 3001,
        stop: 3300,
        reason: 'last-junction-50bp',
      })
    })
  })

  describe('long internal CDS exon (forward strand)', () => {
    // CDS exons: [1001,1100] 100 bp first, [2001,2500] 500 bp internal (>400),
    // [3001,3100] 100 bp penultimate, [4001,4300] 300 bp last.
    // Expected escape:
    //   - first 100 bp of CDS = [1001, 1100] (start-proximal)
    //   - entire 500 bp internal exon = [2001, 2500] (long-exon)
    //   - 50 bp at 3'-end of penultimate = [3051, 3100] (last-junction-50bp)
    //   - entire last exon = [4001, 4300] (last-junction-50bp)
    // Expected sensitive: first 50 bp of the penultimate exon = [3001, 3050].
    const transcript = {
      strand: '+' as const,
      exons: [cds(1001, 1100), cds(2001, 2500), cds(3001, 3100), cds(4001, 4300)],
    }
    const result = predictNmdRegion(transcript)

    it('marks the entire long internal exon as long-exon escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({
        start: 2001,
        stop: 2500,
        reason: 'long-exon',
      })
    })

    it('leaves the first 50 bp of the short penultimate exon NMD-sensitive', () => {
      expect(result.nmdSensitiveRegions).toEqual([{ start: 3001, stop: 3050 }])
    })

    it('NMD-sensitive and NMD-escape spans together cover the full CDS without overlap', () => {
      const totalCdsLen = 100 + 500 + 100 + 300
      expect(sumLen(result.nmdSensitiveRegions) + sumLen(result.nmdEscapeRegions)).toBe(totalCdsLen)
    })
  })
})

describe('nmdEscapeReasonAtPosition', () => {
  // Forward strand: 500 bp first exon (>400), 200 bp penultimate, 300 bp last.
  const transcript = {
    strand: '+' as const,
    exons: [cds(1001, 1500), cds(2001, 2200), cds(3001, 3300)],
  }

  it('returns the start-proximal reason within the first 100 bp', () => {
    expect(nmdEscapeReasonAtPosition(transcript, 1050)).toBe('start-proximal')
  })

  it('returns the long-exon reason for the rest of the long first exon', () => {
    expect(nmdEscapeReasonAtPosition(transcript, 1300)).toBe('long-exon')
  })

  it('returns the last-junction reason in the final exon and 50 bp upstream', () => {
    expect(nmdEscapeReasonAtPosition(transcript, 3100)).toBe('last-junction-50bp')
    expect(nmdEscapeReasonAtPosition(transcript, 2175)).toBe('last-junction-50bp')
  })

  it('returns null for an NMD-sensitive position', () => {
    expect(nmdEscapeReasonAtPosition(transcript, 2100)).toBeNull()
  })

  it('returns null for a position outside the CDS', () => {
    expect(nmdEscapeReasonAtPosition(transcript, 5000)).toBeNull()
  })
})
