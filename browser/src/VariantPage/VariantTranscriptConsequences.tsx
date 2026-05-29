import React from 'react'

import { Badge } from '@gnomad/ui'

import { BaseQuery } from '../Query'
import { nmdEscapeReasonAtPosition, NMD_PTC_CONSEQUENCES } from '../GenePage/nmdRegion'
import { TranscriptConsequenceList } from './TranscriptConsequenceList'
import TranscriptConsequencePropType from './TranscriptConsequencePropType'

type Props = {
  variant: {
    reference_genome: 'GRCh37' | 'GRCh38'
    pos: number
    transcript_consequences: TranscriptConsequencePropType[]
  }
}

// Build a single batched query that fetches transcript exons + strand for every
// gene the variant touches, one aliased gene() field per gene.
const buildGeneTranscriptsQuery = (geneIds: string[], referenceGenome: string) => `
query VariantNmdGeneTranscripts {
${geneIds
  .map(
    (geneId, i) => `  g${i}: gene(gene_id: "${geneId}", reference_genome: ${referenceGenome}) {
    strand
    transcripts {
      transcript_id
      exons {
        feature_type
        start
        stop
      }
    }
  }`
  )
  .join('\n')}
}`

// Determine each PTC consequence's NMD outcome from the variant position and the
// transcript's exon structure, tagging the consequence with an `nmd` field.
const annotateConsequencesWithNmd = (
  transcriptConsequences: TranscriptConsequencePropType[],
  data: any,
  geneIds: string[],
  pos: number
) => {
  const transcriptInfoById = new Map<string, { strand: '+' | '-'; exons: any[] }>()
  geneIds.forEach((_, i) => {
    const gene = data[`g${i}`]
    if (!gene) {
      return
    }
    gene.transcripts.forEach((transcript: any) => {
      transcriptInfoById.set(transcript.transcript_id, {
        strand: gene.strand,
        exons: transcript.exons,
      })
    })
  })

  return transcriptConsequences.map((csq) => {
    if (!csq.major_consequence || !NMD_PTC_CONSEQUENCES.has(csq.major_consequence)) {
      return csq
    }
    const info = transcriptInfoById.get(csq.transcript_id)
    if (!info) {
      return csq
    }
    const reason = nmdEscapeReasonAtPosition(info, pos)
    return { ...csq, nmd: reason ? { escape: true, reason } : { escape: false } }
  })
}

const VariantTranscriptConsequences = ({ variant }: Props) => {
  const { transcript_consequences } = variant
  const transcriptConsequences = transcript_consequences || []
  const numTranscripts = transcriptConsequences.length
  const geneIds = Array.from(new Set(transcriptConsequences.map((csq) => csq.gene_id)))
  const numGenes = geneIds.length

  return (
    <div>
      <p>
        This variant falls on {numTranscripts} transcript{numTranscripts !== 1 && 's'} in {numGenes}{' '}
        gene{numGenes !== 1 && 's'}.
      </p>

      <p>
        <Badge level="info">Note</Badge> The gene symbols shown below are provided by VEP and may
        differ from the symbol shown on gene pages.
      </p>

      {geneIds.length === 0 ? (
        <TranscriptConsequenceList transcriptConsequences={transcriptConsequences} />
      ) : (
        <BaseQuery
          operationName="VariantNmdGeneTranscripts"
          query={buildGeneTranscriptsQuery(geneIds, variant.reference_genome)}
          url="/api/"
          variables={{}}
        >
          {({ data, error, loading }: any) => {
            // NMD annotation is supplementary; render consequences regardless of
            // whether the gene fetch is still loading or has failed.
            const consequences =
              !loading && !error && data
                ? annotateConsequencesWithNmd(transcriptConsequences, data, geneIds, variant.pos)
                : transcriptConsequences
            return <TranscriptConsequenceList transcriptConsequences={consequences} />
          }}
        </BaseQuery>
      )}
    </div>
  )
}

export default VariantTranscriptConsequences
