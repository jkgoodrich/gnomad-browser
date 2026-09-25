"""Export the GRIN2B fixtures served to the local demo browser (DONTMERGE)."""

import argparse
import json
import os
import tempfile

import hail as hl

from data_pipeline.datasets.gnomad_v4.gnomad_v4_missense_constraint_3d import (
    prepare_gnomad_v4_missense_constraint_3d,
)

GENE_ID = "ENSG00000273079"
UNIPROT_ID = "Q13224"
TRANSCRIPT_ID = "ENST00000609686"


def write_json(path, value):
    with open(path, "w") as output:
        json.dump(value, output, indent=2)
        output.write("\n")


def export_missense_constraint_3d(residues_path, uniprot_features_path):
    with tempfile.TemporaryDirectory() as tmp_dir:
        residues = hl.read_table(residues_path)
        residues = residues.filter(residues.uniprot_id == UNIPROT_ID)
        filtered_residues_path = os.path.join(tmp_dir, "residues.ht")
        residues.write(filtered_residues_path)

        uniprot = hl.read_table(uniprot_features_path)
        uniprot = uniprot.filter(uniprot.uniprot_id == UNIPROT_ID)
        filtered_uniprot_path = os.path.join(tmp_dir, "uniprot.ht")
        uniprot.write(filtered_uniprot_path)

        ds = prepare_gnomad_v4_missense_constraint_3d(filtered_residues_path, filtered_uniprot_path)
        ds = ds.filter(ds.transcript_id == TRANSCRIPT_ID)
        [constraint] = ds.aggregate(hl.agg.collect(hl.json(ds.missense_constraint_3d)))
    return {"data": {"gene": {"missense_constraint_3d": json.loads(constraint)}}}


# The v4 RMC is in the same gene table the earlier missense constraint demo exported from
def export_regional_missense_constraint(genes_path):
    genes = hl.read_table(genes_path)
    genes = genes.filter(genes.gene_id == GENE_ID)
    [regional_missense_constraint] = genes.aggregate(hl.agg.collect(hl.json(genes.gnomad_regional_missense_constraint)))
    regional_missense_constraint = json.loads(regional_missense_constraint)
    # The browser shows GRCh38 coordinates without the "chr" prefix
    for region in regional_missense_constraint["regions"]:
        region["chrom"] = region["chrom"].removeprefix("chr")
    return regional_missense_constraint


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--residues-path", required=True)
    parser.add_argument("--uniprot-features-path", required=True)
    parser.add_argument("--genes-path", required=True)
    parser.add_argument("--missense-constraint-3d-output", required=True)
    parser.add_argument("--regional-missense-constraint-output", required=True)
    args = parser.parse_args()

    hl.init(quiet=True, spark_conf={"spark.hadoop.google.cloud.auth.type": "APPLICATION_DEFAULT"})

    write_json(
        args.missense_constraint_3d_output,
        export_missense_constraint_3d(args.residues_path, args.uniprot_features_path),
    )
    write_json(args.regional_missense_constraint_output, export_regional_missense_constraint(args.genes_path))


if __name__ == "__main__":
    main()
