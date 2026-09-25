---
id: missense-constraint-3d
title: '3D missense constraint'
---

The 3D missense constraint track shows regions of a protein that are depleted of missense variation in gnomAD v4.1, where each region is a set of residues that are close together in the protein's predicted 3D structure rather than a contiguous stretch of sequence. It is currently displayed when selecting a gnomAD v4 dataset.

### Methods

Regions were identified from the AlphaFold predicted structure of each protein. Starting from each residue, candidate regions were grown from its nearest neighbors in 3D space, and regions were added one at a time (forward selection) while doing so improved the model's fit to the observed pattern of missense variation, as measured by the Akaike information criterion (AIC). Residues were only grouped with a region's central residue if the predicted aligned error (PAE) between them was at most 15 Å, and each region was required to have at least 16 expected missense variants. Residues not assigned to any region form the protein's "catch-all" region.

For each region we report the number of observed and expected rare missense variants, the observed/expected (o/e) ratio, the upper bound of the o/e confidence interval, and a p-value for the region's missense constraint.

### Transcripts and protein structures

Constraint was computed for the protein encoded by the gene's MANE Select transcript (or its Ensembl canonical transcript when there is no MANE Select transcript), matched to the UniProt entry with the same sequence. Residues are numbered from the start of that protein. Structures are loaded from the [AlphaFold Protein Structure Database](https://alphafold.ebi.ac.uk/) and are shown only when their sequence matches the protein used for the constraint analysis.

AlphaFold structures are predictions. Regions of low predicted confidence (pLDDT below 70), shown in the residue tooltip, are often disordered and should be interpreted with caution.

### Colors

- **Missense o/e**: each region is colored by its missense o/e ratio, from dark red (most constrained) to light yellow.
- **o/e upper bound**: each region is colored by the upper bound of its o/e confidence interval using the same scale.
- **Regions**: the 10 regions with the lowest o/e among those with p ≤ 1e-3 are shown in distinct colors, ranked from most to least constrained. All other residues are gray.

The catch-all region is gray unless "Color catch-all region" is selected.

The structure can also be colored by:

- **RMC o/e** (when regional missense constraint is available for the gene): each residue is colored by the missense o/e of the [regional missense constraint](/help/regional-constraint) region containing it, using the same colors as the regional missense constraint track.
- **pLDDT**: each residue is colored by AlphaFold's confidence in its predicted position, using the AlphaFold Protein Structure Database's colors.

With these options, the track keeps showing the missense o/e of each 3D region.

### Showing the structure

Select "Show structure" to view the AlphaFold structure colored the same way as the track. Hover over a region in the track to highlight all of its residues in the structure, or over a residue in the structure to see its region, predicted confidence, and any features shown on the structure. The structure can also show:

- **gnomAD missense variants**: missense variants in the selected dataset that pass quality control in the exomes or genomes, placed using their HGVSp annotation on the constraint transcript.
- **ClinVar pathogenic / likely pathogenic missense variants**: ClinVar missense variants classified as pathogenic, likely pathogenic, association, or risk factor.
- **UniProt features**: protein features such as transmembrane regions, domains, and binding sites from UniProtKB release 2021_04.

Variants are only shown when the reference amino acid in their HGVSp annotation matches the protein sequence.

### Data sources and licenses

Predicted structures are from the AlphaFold Protein Structure Database ([Jumper _et al._ Nature 2021](https://www.nature.com/articles/s41586-021-03819-2); [Varadi _et al._ Nucleic Acids Research 2024](https://academic.oup.com/nar/article/52/D1/D368/7337620)), available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Protein features are from [UniProtKB](https://www.uniprot.org/), available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
