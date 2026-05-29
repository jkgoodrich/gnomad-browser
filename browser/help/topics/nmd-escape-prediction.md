---
id: nmd-escape-prediction
title: NMD escape prediction
---

This annotation predicts whether a premature termination codon (PTC) introduced by a stop-gained or frameshift variant is likely to **escape nonsense-mediated decay (NMD)** in a given transcript. A PTC that escapes NMD may produce a truncated protein rather than no protein, which can change the expected consequence of the variant.

The prediction is made **per transcript**, because a variant's position relative to a transcript's exon structure determines the outcome. The same variant can be NMD-sensitive in one transcript and predicted to escape in another isoform with a different coding-exon structure.

### Escape rules

A region is predicted to escape NMD if it falls under any of the following rules (matching the UCSC "NMD escape" track):

- **Last exon / 50 bp rule** — in the final coding exon, or within 50 bp upstream of the last exon–exon junction. No downstream junction complex remains to trigger NMD.
- **Start-proximal** — within the first 100 bp of the coding sequence. A PTC here can be bypassed by translation re-initiation at a downstream start codon.
- **Long exon** — in an internal coding exon longer than 400 bp, where the increased distance to the downstream junction complex reduces NMD efficiency.
- **No downstream junction** — single-coding-exon transcripts, which deposit no downstream exon–exon junction complex.

### Relationship to the pLoF (LOFTEE) annotation

The NMD-escape prediction is **independent of, and complementary to, the LOFTEE high-/low-confidence (HC/LC) pLoF call**. The two answer different questions:

- **LOFTEE** assesses whether the variant is a _genuine, well-annotated_ loss-of-function allele, filtering annotation and sequencing artifacts, splice rescue, ancestral alleles, and so on. Its only NMD-related filter, `END_TRUNC`, simply removes variants in the last 5% of the transcript (those that truncate too little of the protein to matter).
- **The NMD-escape prediction** applies the full last-exon, 50 bp, start-proximal, and long-exon rules above.

Because `END_TRUNC` is a coarse percentage-based proxy, the two agree only at the extreme 3′ end of the transcript. A variant can therefore legitimately be **high-confidence pLoF and still be predicted to escape NMD** — for example a stop-gain in the first 100 bp of the coding sequence, or one in the last coding exon of a shorter isoform that still removes well over 5% of the protein. In these cases the variant is a real loss-of-function allele by LOFTEE's criteria, but is predicted to yield a truncated protein rather than a null.
