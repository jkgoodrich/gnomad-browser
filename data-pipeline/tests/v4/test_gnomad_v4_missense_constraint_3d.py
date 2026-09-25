import hail as hl
import pytest

from data_pipeline.datasets.gnomad_v4.gnomad_v4_missense_constraint_3d import (
    prepare_gnomad_v4_missense_constraint_3d,
)

RESIDUES_SCHEMA = hl.tstruct(
    uniprot_id=hl.tstr,
    transcript_id=hl.tstr,
    residue_index=hl.tint32,
    region_index=hl.tint32,
    obs=hl.tint64,
    exp=hl.tfloat64,
    oe=hl.tfloat64,
    oe_upper=hl.tfloat64,
    p_value=hl.tfloat64,
    is_null=hl.tbool,
)

UNIPROT_FEATURE_SCHEMA = hl.tstruct(feature_type=hl.tstr, location=hl.tstr, start=hl.tstr, end=hl.tstr, note=hl.tstr)

UNIPROT_SCHEMA = hl.tstruct(
    uniprot_id=hl.tstr,
    sequence=hl.tstr,
    map_2021_04=hl.tstruct(sequence=hl.tstr, features=hl.tarray(UNIPROT_FEATURE_SCHEMA)),
)

SEQUENCE = "MACDEFGC"

CONSTRAINED_REGION = {
    "region_index": 0,
    "obs": 2,
    "exp": 10.0,
    "oe": 0.2,
    "oe_upper": 0.4,
    "p_value": 1e-5,
    "is_null": False,
}
CATCH_ALL_REGION = {
    "region_index": 1,
    "obs": 9,
    "exp": 9.0,
    "oe": 1.0,
    "oe_upper": 1.2,
    "p_value": 0.9,
    "is_null": True,
}

# 0-based residues 0-2 and 5 are in the constrained region; 3-4 and 6-7 are in the catch-all region
RESIDUES = [
    {"uniprot_id": "P00001", "transcript_id": "ENST00000000001", "residue_index": residue_index, **region}
    for residue_index, region in enumerate(
        [CONSTRAINED_REGION] * 3 + [CATCH_ALL_REGION] * 2 + [CONSTRAINED_REGION] + [CATCH_ALL_REGION] * 2
    )
]

FEATURES = [
    {"feature_type": "transmembrane region", "location": "2..4", "start": "2", "end": "4", "note": "Helical"},
    {"feature_type": "disulfide bond", "location": "3..8", "start": "3", "end": "8", "note": ""},
    {"feature_type": "sequence variant", "location": "5", "start": "5", "end": "5", "note": "In dbSNP"},
    {"feature_type": "binding site", "location": "P00001-2:5", "start": "5", "end": "5", "note": "Isoform only"},
    {"feature_type": "signal peptide", "location": "<1..3", "start": "<1", "end": "3", "note": ""},
]


def write_table(path, rows, schema, key):
    ds = hl.Table.parallelize(hl.literal(rows, hl.tarray(schema)), key=key)
    ds.write(str(path))
    return str(path)


def prepare(tmp_path, residues=RESIDUES, sequence=SEQUENCE, feature_release_sequence=SEQUENCE):
    residues_path = write_table(
        tmp_path / "residues.ht", residues, RESIDUES_SCHEMA, ["uniprot_id", "transcript_id", "residue_index"]
    )
    uniprot_path = write_table(
        tmp_path / "uniprot.ht",
        [
            {
                "uniprot_id": "P00001",
                "sequence": sequence,
                "map_2021_04": {"sequence": feature_release_sequence, "features": FEATURES},
            }
        ],
        UNIPROT_SCHEMA,
        ["uniprot_id"],
    )
    return prepare_gnomad_v4_missense_constraint_3d(residues_path, uniprot_path).collect()


def test_regions_are_keyed_by_transcript_with_1_based_segments(tmp_path):
    [row] = prepare(tmp_path)

    assert row.transcript_id == "ENST00000000001"
    constraint = row.missense_constraint_3d
    assert (constraint.transcript_id, constraint.uniprot_id, constraint.protein_sequence) == (
        "ENST00000000001",
        "P00001",
        SEQUENCE,
    )
    assert [
        (region.region_index, region.is_catch_all, [(s.aa_start, s.aa_stop) for s in region.segments])
        for region in constraint.regions
    ] == [(0, False, [(1, 3), (6, 6)]), (1, True, [(4, 5), (7, 8)])]
    constrained_region = constraint.regions[0]
    assert (
        constrained_region.obs_mis,
        constrained_region.exp_mis,
        constrained_region.obs_exp,
        constrained_region.oe_upper,
        constrained_region.p_value,
    ) == (2, 10.0, 0.2, 0.4, 1e-5)


def test_uniprot_features_are_filtered_and_disulfide_bonds_split(tmp_path):
    [row] = prepare(tmp_path)

    assert [
        (feature.feature_type, feature.start, feature.stop, feature.note)
        for feature in row.missense_constraint_3d.uniprot_features
    ] == [
        ("transmembrane region", 2, 4, "Helical"),
        ("disulfide bond", 3, 3, ""),
        ("disulfide bond", 8, 8, ""),
    ]


def test_uniprot_features_are_dropped_when_release_sequence_differs(tmp_path):
    [row] = prepare(tmp_path, feature_release_sequence="MACDEFGA")

    assert row.missense_constraint_3d.uniprot_features == []


def test_residue_positions_beyond_the_protein_sequence_are_rejected(tmp_path):
    with pytest.raises(Exception, match=r"outside 1\.\.7"):
        prepare(tmp_path, sequence="MACDEFG", feature_release_sequence="MACDEFG")
