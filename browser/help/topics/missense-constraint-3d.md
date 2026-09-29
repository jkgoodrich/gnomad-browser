---
id: missense-constraint-3d
title: '3D missense constraint'
---

The 3D missense constraint track shows regions of a protein that are depleted of missense variation in gnomAD v4.1, where each region is a set of residues that are close together in the protein's predicted 3D structure rather than a contiguous stretch of sequence. It is currently displayed when selecting a gnomAD v4 dataset.

### Methods

Regions were identified from the AlphaFold predicted structure of each protein. Starting from each residue, candidate regions were grown from its nearest neighbors in 3D space, and regions were added one at a time (forward selection) while doing so improved the model's fit to the observed pattern of missense variation, as measured by the Akaike information criterion (AIC). Residues were only grouped with a region's central residue if the predicted aligned error (PAE) between them was at most 15 Å, and each region was required to have at least 16 expected missense variants. Residues not assigned to any region are labeled "Unassigned residue", and their missense o/e is calculated across all of them together.

For each region we report the number of observed and expected rare missense variants, the observed/expected (o/e) ratio, the upper bound of the o/e confidence interval, and a p-value for the region's missense constraint.

### Transcripts and protein structures

Constraint was computed for the protein encoded by the gene's MANE Select transcript (or its Ensembl canonical transcript when there is no MANE Select transcript), matched to the UniProt entry with the same sequence. Residues are numbered from the start of that protein. Structures are loaded from the [AlphaFold Protein Structure Database](https://alphafold.ebi.ac.uk/) and are shown only when their sequence matches the protein used for the constraint analysis.

AlphaFold structures are predictions. Regions of low predicted confidence (pLDDT below 70), shown in the residue tooltip, are often disordered and should be interpreted with caution.

### Colors

The track colors each region by the upper bound of its missense o/e confidence interval, from dark red (most constrained) to light yellow. The structure is colored the same way at first, and can be colored by:

- **Missense o/e**: each region's missense o/e ratio, with the same colors.
- **o/e upper bound**: like the track.
- **Regions**: the 10 regions with the lowest o/e among those with p ≤ 1e-3 in distinct colors, ranked from most to least constrained. The legend lists each colored region's rank. Other regions are gray.
- **RMC o/e** (when regional missense constraint is available for the gene): the missense o/e of the [regional missense constraint](/help/regional-constraint) region containing each residue, using the same colors as the regional missense constraint track.
- **RMC o/e upper** (when the upper bounds of regional missense constraint are available): the same, using the upper bound of each region's o/e confidence interval.
- **pLDDT**: AlphaFold's confidence in each residue's predicted position, using the AlphaFold Protein Structure Database's colors.
- **None**: no colors, so that the variants and features shown on the structure stand out.

With Missense o/e, Regions, RMC o/e upper and pLDDT, another track below the 3D missense constraint track shows those colors along the gene too. The regional missense constraint track already shows RMC o/e.

Regions that are not significant (p > 1e-3) are colored by their o/e or upper bound too, unless "Color non-significant regions" is cleared, which makes them gray. Unassigned residues are gray with hatching on the tracks, and alternate between light and dark gray on the structure, unless "Color unassigned residues" is selected.

### Listing the regions

Select "Show regions" to list every region below the track, with the number of its residues, the number of separate stretches of sequence they form, its first and last residues, and its missense constraint, above a summary of how many regions there are and how large they are. Select a column heading to sort by it, and hover over a region to outline its segments in the track and highlight its residues in the structure.

### Showing the structure

Select "Show structure" to view the AlphaFold structure colored the same way as the track. Drag to rotate the structure, and scroll or use the zoom buttons to zoom in and out. "Reset colors" and "Reset rotation and zoom" go back to the starting coloring and view, and each section of the legend beside the structure has its own "Reset" once it has been changed. Hover over a region in the track to highlight all of its residues in the structure and outline all of its segments in the track, or over a residue in the structure to see its region, predicted confidence, and any features shown on the structure. With the "Regions" colors, hovering over a residue also highlights its whole region, and clicking a region in the track, or a residue while "Select" is Off, keeps the region highlighted while you rotate the structure, until you click it again or select "Unpin". The panel beside the structure can also show:

- **UniProt features**: residues and regions annotated in UniProtKB, such as binding sites and transmembrane regions. Selected features are also shown as rows between the track and the structure. See [UniProt features](/help/uniprot-features).
- **Current selection in the ClinVar track**: the ClinVar variants shown in the ClinVar track below, after its filters, colored by clinical significance like the ClinVar track. Residues with several variants take the color of the most pathogenic. The legend has the track's clinical significance and review status filters too, so they can be changed in either place.
- **Current selection in the gnomAD variants table**: the variants listed in the gnomAD variants table below, after its filters and search, colored by consequence like the table. Residues with several variants take the color of the most severe consequence. The legend has the table's consequence filters and search too, so they can be changed in either place. While searching, the structure shows only the variants that match, even when the table also lists their neighbors.

Variants are placed using their HGVSp annotation on the constraint transcript, and only when its reference amino acid matches the protein sequence, so variants in the ClinVar and table selections that don't change the protein, such as intronic variants, aren't shown. Variant and feature colors are chosen to stand out against the missense o/e colors, and the panel's sliders set their transparency and size.

### Selecting residues

Use "Select" above the structure to select residues:

- **Residue**: click residues to select or deselect them.
- **Box**: drag a box to select the residues whose alpha carbon is inside it, including residues behind others.
- **3D region**: click a residue to select or deselect all the residues of its 3D missense constraint region.

While the structure is shown, the colors in the track's legend, and in the key above the structure, work the same way: hover over a color to highlight its residues in the structure, and click it to select or deselect them.

Residues outside the selection are faded, and the ClinVar variants track and gnomAD variants table below show only the variants whose positions are in the coding bases of the selected residues. Select "Clear selection", or "Show all variants" in those sections, to show all variants again.

### Data sources and licenses

Predicted structures are from the AlphaFold Protein Structure Database ([Jumper _et al._ Nature 2021](https://www.nature.com/articles/s41586-021-03819-2); [Varadi _et al._ Nucleic Acids Research 2024](https://academic.oup.com/nar/article/52/D1/D368/7337620)), available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Protein features are from [UniProtKB](https://www.uniprot.org/), available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
