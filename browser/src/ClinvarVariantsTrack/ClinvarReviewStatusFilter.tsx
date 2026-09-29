import React from 'react'

import { ExternalLink } from '@gnomad/ui'

type Props = {
  id: string
  // The fewest review status stars a variant can have to be included
  value: number
  onChange: (minimumStars: number) => void
}

const ClinvarReviewStatusFilter = ({ id, value, onChange }: Props) => (
  <label htmlFor={id}>
    Filter by{' '}
    <ExternalLink href="https://www.ncbi.nlm.nih.gov/clinvar/docs/review_status/">
      review status
    </ExternalLink>
    : &nbsp;
    <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      <option value={0}> 0-4 Stars </option>
      <option value={1}> {'>'}=1 Stars </option>
      <option value={2}> {'>'}=2 Stars </option>
      <option value={3}> {'>'}=3 Stars </option>
      <option value={4}> 4 Stars </option>
    </select>
  </label>
)

export default ClinvarReviewStatusFilter
