import { predictNmdRegion } from './nmdRegion'

const cds = (start: number, stop: number) => ({ feature_type: 'CDS', start, stop })
const utr = (start: number, stop: number) => ({ feature_type: 'UTR', start, stop })

describe('predictNmdRegion', () => {
  describe('forward-strand multi-CDS-exon transcript', () => {
    // 3 CDS exons of length 100, 200, 300 in transcript order.
    // Penultimate CDS exon is [2001, 2200] (length 200, > 50bp).
    // Expected escape = last CDS [3001, 3300] + 50bp at 3'-end of penultimate = [2151, 2200].
    // Expected sensitive = first CDS [1001, 1100] + remaining penultimate [2001, 2150].
    const transcript = {
      strand: '+' as const,
      exons: [cds(1001, 1100), cds(2001, 2200), cds(3001, 3300), utr(501, 1000)],
    }
    const result = predictNmdRegion(transcript)

    it('returns multi-exon-50bp rationale', () => {
      expect(result.rationale).toBe('multi-exon-50bp')
    })

    it('places the entire last CDS exon in NMD-escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({ start: 3001, stop: 3300 })
    })

    it('places the 50bp at the 3-prime end of the penultimate exon in NMD-escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({ start: 2151, stop: 2200 })
    })

    it('places the rest of the penultimate exon in NMD-sensitive', () => {
      expect(result.nmdSensitiveRegions).toContainEqual({ start: 2001, stop: 2150 })
    })

    it('places upstream CDS exons entirely in NMD-sensitive', () => {
      expect(result.nmdSensitiveRegions).toContainEqual({ start: 1001, stop: 1100 })
    })

    it('ignores UTR exons', () => {
      const allCoords = [...result.nmdSensitiveRegions, ...result.nmdEscapeRegions]
      expect(allCoords.every((r) => r.start >= 1001 && r.stop <= 3300)).toBe(true)
    })

    it('NMD-sensitive and NMD-escape spans together cover the full CDS without overlap', () => {
      const totalCdsLen = 100 + 200 + 300
      const sumLen = (rs: { start: number; stop: number }[]) =>
        rs.reduce((acc, r) => acc + (r.stop - r.start + 1), 0)
      expect(sumLen(result.nmdSensitiveRegions) + sumLen(result.nmdEscapeRegions)).toBe(totalCdsLen)
    })
  })

  describe('reverse-strand multi-CDS-exon transcript', () => {
    // On - strand, transcript order is descending genomic coordinate.
    // CDS exons (genomic): [1001, 1100], [2001, 2200], [3001, 3300]
    // Transcript order: 3001-3300 first, then 2001-2200, then 1001-1100 (last in transcript).
    // Penultimate CDS exon (transcript order) = [2001, 2200].
    // Its 3'-end (transcript) = smallest genomic coord = position 2001.
    // 50bp at 3'-end = [2001, 2050].
    // Escape = last CDS [1001, 1100] + [2001, 2050]; sensitive = [2051, 2200] + [3001, 3300].
    const transcript = {
      strand: '-' as const,
      exons: [cds(1001, 1100), cds(2001, 2200), cds(3001, 3300)],
    }
    const result = predictNmdRegion(transcript)

    it('returns multi-exon-50bp rationale', () => {
      expect(result.rationale).toBe('multi-exon-50bp')
    })

    it('places the entire last CDS exon (smallest genomic coords) in NMD-escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({ start: 1001, stop: 1100 })
    })

    it('places the 50bp at the 3-prime end of the penultimate exon in NMD-escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({ start: 2001, stop: 2050 })
    })

    it('places the rest of the penultimate exon in NMD-sensitive', () => {
      expect(result.nmdSensitiveRegions).toContainEqual({ start: 2051, stop: 2200 })
    })

    it('places upstream CDS exons (largest genomic coords) entirely in NMD-sensitive', () => {
      expect(result.nmdSensitiveRegions).toContainEqual({ start: 3001, stop: 3300 })
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
      expect(result.nmdEscapeRegions).toEqual([{ start: 1001, stop: 1500 }])
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

  describe('penultimate CDS exon shorter than 50bp', () => {
    // Penultimate CDS exon is only 20bp long, so the entire exon plus 30bp of the
    // CDS exon upstream of it should be NMD-escape.
    const transcript = {
      strand: '+' as const,
      exons: [cds(1001, 1500), cds(2001, 2020), cds(3001, 3300)],
    }
    const result = predictNmdRegion(transcript)

    it('absorbs the full penultimate exon into NMD-escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({ start: 2001, stop: 2020 })
    })

    it('extends NMD-escape 30bp into the next-upstream CDS exon', () => {
      expect(result.nmdEscapeRegions).toContainEqual({ start: 1471, stop: 1500 })
      expect(result.nmdSensitiveRegions).toContainEqual({ start: 1001, stop: 1470 })
    })

    it('keeps the last CDS exon entirely in NMD-escape', () => {
      expect(result.nmdEscapeRegions).toContainEqual({ start: 3001, stop: 3300 })
    })
  })
})
