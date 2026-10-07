import hail as hl

# UniProt release whose sequences the AlphaFold models used for the analysis were predicted from
UNIPROT_FEATURES_RELEASE = "map_2021_04"
# Whether the analysis's sequence was found as the entry's sequence in that release
UNIPROT_FEATURES_RELEASE_FOUND = "found_in_2021_04"

# UniProt feature types the browser can overlay on the structure
UNIPROT_FEATURE_TYPES = {
    "active site",
    "binding site",
    "coiled-coil region",
    "disulfide bond",
    "DNA-binding region",
    "domain",
    "glycosylation site",
    "intramembrane region",
    "lipid moiety-binding region",
    "metal ion-binding site",
    "propeptide",
    "region of interest",
    "repeat",
    "short sequence motif",
    "signal peptide",
    "site",
    "topological domain",
    "transit peptide",
    "transmembrane region",
    "zinc finger region",
}


def _residue_segments(residue_indices):
    # Collapse sorted 0-based residue indices into runs of consecutive residues, numbered from 1
    n = hl.len(residue_indices)
    run_starts = hl.range(n).filter(
        lambda i: hl.if_else(i == 0, True, residue_indices[i] != residue_indices[i - 1] + 1)
    )
    run_stops = hl.range(n).filter(
        lambda i: hl.if_else(i == n - 1, True, residue_indices[i + 1] != residue_indices[i] + 1)
    )
    return hl.zip(run_starts, run_stops).map(
        lambda run: hl.struct(aa_start=residue_indices[run[0]] + 1, aa_stop=residue_indices[run[1]] + 1)
    )


# UniProt positions an entry's features on its canonical sequence. The release's record can be for
# another of the entry's isoforms, with that isoform's sequence, so the features also fit when the
# analysis's sequence was found as the entry's own sequence in the release.
def _uniprot_features_fit_sequence(uniprot):
    release = uniprot[UNIPROT_FEATURES_RELEASE]
    found = uniprot[UNIPROT_FEATURES_RELEASE_FOUND]
    is_other_isoform_of_entry = (release.id.split("-")[0] == uniprot.uniprot_id) & ~release.isoform_canonical
    return hl.coalesce(release.sequence == uniprot.sequence, False) | hl.coalesce(
        is_other_isoform_of_entry & found.by_uniprot_id & found.by_seq, False
    )


def _uniprot_features(uniprot):
    release = uniprot[UNIPROT_FEATURES_RELEASE]
    features = release.features.filter(
        # Features located on another isoform (e.g. "P31946-2:1..26") don't apply to this sequence
        lambda feature: (
            hl.literal(UNIPROT_FEATURE_TYPES).contains(feature.feature_type) & ~feature.location.contains(":")
        )
    )
    features = features.map(
        lambda feature: hl.struct(
            feature_type=feature.feature_type,
            start=hl.parse_int32(feature.start),
            stop=hl.parse_int32(feature.end),
            note=feature.note,
        )
    )
    # Uncertain positions (e.g. "<1", "?") don't parse
    features = features.filter(lambda feature: hl.is_defined(feature.start) & hl.is_defined(feature.stop))
    # A disulfide bond's start and end are the two bonded cysteines, not a span
    features = features.flatmap(
        lambda feature: hl.if_else(
            feature.feature_type == "disulfide bond",
            [feature.annotate(stop=feature.start), feature.annotate(start=feature.stop)],
            [feature],
        )
    )
    return hl.if_else(
        _uniprot_features_fit_sequence(uniprot),
        features,
        hl.empty_array(features.dtype.element_type),
    )


def _validate_residue_positions(ds):
    sequence_length = hl.len(ds.protein_sequence)
    positions = ds.regions.flatmap(
        lambda region: region.segments.flatmap(lambda segment: [segment.aa_start, segment.aa_stop])
    ).extend(ds.uniprot_features.flatmap(lambda feature: [feature.start, feature.stop]))
    is_valid = positions.all(lambda position: (position >= 1) & (position <= sequence_length))
    return ds.filter(
        hl.case(missing_false=True)
        .when(is_valid, True)
        .or_error(
            hl.format(
                "Residue positions for %s (%s) are outside 1..%s or its protein sequence is missing",
                ds.transcript_id,
                ds.uniprot_id,
                hl.str(sequence_length),
            )
        )
    )


def prepare_gnomad_v4_missense_constraint_3d(residues_path, uniprot_features_path):
    residues = hl.read_table(residues_path)
    # Residues that the analysis assigned to no region, not even the catch-all one, have no statistics.
    # They're left out, and so are proteins with none assigned.
    residues = residues.filter(hl.is_defined(residues.region_index))

    # Region statistics are repeated on every residue of the region
    regions = residues.group_by(residues.transcript_id, residues.uniprot_id, residues.region_index).aggregate(
        stats=hl.agg.take(residues.row.select("is_null", "obs", "exp", "oe", "oe_upper", "p_value"), 1)[0],
        residue_indices=hl.sorted(hl.agg.collect(residues.residue_index)),
    )
    regions = regions.annotate(
        region=hl.struct(
            region_index=regions.region_index,
            is_catch_all=regions.stats.is_null,
            obs_mis=regions.stats.obs,
            exp_mis=regions.stats.exp,
            obs_exp=regions.stats.oe,
            oe_upper=regions.stats.oe_upper,
            p_value=regions.stats.p_value,
            segments=_residue_segments(regions.residue_indices),
        )
    )
    ds = regions.group_by(regions.transcript_id, regions.uniprot_id).aggregate(
        regions=hl.sorted(hl.agg.collect(regions.region), key=lambda region: region.region_index)
    )

    uniprot = hl.read_table(uniprot_features_path)
    uniprot = uniprot.select(protein_sequence=uniprot.sequence, uniprot_features=_uniprot_features(uniprot))
    ds = ds.annotate(**uniprot[ds.uniprot_id])

    ds = _validate_residue_positions(ds)

    ds = ds.key_by("transcript_id")
    ds = ds.select(
        missense_constraint_3d=hl.struct(
            transcript_id=ds.transcript_id,
            uniprot_id=ds.uniprot_id,
            protein_sequence=ds.protein_sequence,
            regions=ds.regions,
            uniprot_features=ds.uniprot_features,
        )
    )

    # Don't need the information in globals for the browser
    ds = ds.select_globals()

    return ds
