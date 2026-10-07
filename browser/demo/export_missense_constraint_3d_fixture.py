"""Export the fixtures served to the local demo browser (DONTMERGE)."""

import argparse
import json
import os
import tempfile

import hail as hl
from gnomad.utils.constraint import oe_confidence_interval

from data_pipeline.datasets.gnomad_v4.gnomad_v4_missense_constraint_3d import (
    prepare_gnomad_v4_missense_constraint_3d,
)

# Gene symbols, with the UniProt entry to use where the analysis has more than one for the gene's
# transcript: the reviewed Swiss-Prot entry rather than a TrEMBL one
DEMO_GENES = [
    "GRIN2B",
    "SCN2A",
    "KCNQ2",
    "PTEN:P60484",
    "HCN1",
    "CACNA1A",
    "CHD3",
    "KDM5C",
    "GNAI1",
    "NALCN",
    "PPP3CA:Q08209",
    "GRIN1",
    "USP7",
    "SMC1A:Q14683",
    "BEST1",
]


def write_json(path, value):
    with open(path, "w") as output:
        json.dump(value, output, indent=2)
        output.write("\n")


def parse_gene(gene):
    symbol, _, uniprot_id = gene.partition(":")
    return symbol, uniprot_id or None


# The browser shows 3D missense constraint for each gene's preferred transcript
def demo_genes(genes_path, genes):
    uniprot_ids = dict(parse_gene(gene) for gene in genes)
    ht = hl.read_table(genes_path)
    ht = ht.filter(hl.literal(set(uniprot_ids)).contains(ht.gencode_symbol))
    rows = ht.select("gencode_symbol", "preferred_transcript_id").collect()
    missing = set(uniprot_ids) - {row.gencode_symbol for row in rows}
    if missing:
        raise ValueError(f"Genes not found: {', '.join(sorted(missing))}")
    return [
        {
            "gene_id": row.gene_id,
            "symbol": row.gencode_symbol,
            "transcript_id": row.preferred_transcript_id,
            "uniprot_id": uniprot_ids[row.gencode_symbol],
        }
        for row in rows
    ]


def export_missense_constraint_3d(residues_path, uniprot_features_path, genes):
    transcript_ids = [gene["transcript_id"] for gene in genes]
    pinned_uniprot_ids = {gene["transcript_id"]: gene["uniprot_id"] for gene in genes if gene["uniprot_id"]}

    with tempfile.TemporaryDirectory() as tmp_dir:
        residues = hl.read_table(residues_path)
        residues = residues.filter(hl.literal(transcript_ids).contains(residues.transcript_id))
        pinned = hl.literal(pinned_uniprot_ids, dtype=hl.tdict(hl.tstr, hl.tstr))
        residues = residues.filter(
            pinned.get(residues.transcript_id, residues.uniprot_id) == residues.uniprot_id
        )
        filtered_residues_path = os.path.join(tmp_dir, "residues.ht")
        residues.write(filtered_residues_path)
        residues = hl.read_table(filtered_residues_path)
        uniprot_ids = residues.aggregate(hl.agg.collect_as_set(residues.uniprot_id))

        uniprot = hl.read_table(uniprot_features_path)
        uniprot = uniprot.filter(hl.literal(uniprot_ids).contains(uniprot.uniprot_id))
        filtered_uniprot_path = os.path.join(tmp_dir, "uniprot.ht")
        uniprot.write(filtered_uniprot_path)

        ds = prepare_gnomad_v4_missense_constraint_3d(filtered_residues_path, filtered_uniprot_path)
        rows = ds.select(json=hl.json(ds.missense_constraint_3d)).collect()

    constraint_by_transcript = {}
    for row in rows:
        if row.transcript_id in constraint_by_transcript:
            raise ValueError(f"{row.transcript_id} has more than one UniProt entry; choose one in --genes")
        constraint_by_transcript[row.transcript_id] = json.loads(row.json)
    return {
        gene["gene_id"]: {
            "data": {"gene": {"missense_constraint_3d": constraint_by_transcript.get(gene["transcript_id"])}}
        }
        for gene in genes
    }


# The v4 RMC is in the same gene table the earlier missense constraint demo exported from. It has no
# o/e upper bound, so one is added like the 3D regions', with the Gamma method.
def export_regional_missense_constraint(genes_path, genes):
    ht = hl.read_table(genes_path)
    ht = ht.filter(hl.literal([gene["gene_id"] for gene in genes]).contains(ht.gene_id))
    rmc = ht.gnomad_regional_missense_constraint
    rmc = rmc.annotate(
        regions=rmc.regions.map(
            lambda region: region.annotate(
                obs_exp_upper=oe_confidence_interval(region.obs_mis, region.exp_mis, method="gamma").upper
            )
        )
    )
    rows = ht.select(json=hl.json(rmc)).collect()

    regional_missense_constraint_by_gene = {}
    for row in rows:
        regional_missense_constraint = json.loads(row.json)
        if regional_missense_constraint is None:
            continue
        # The browser shows GRCh38 coordinates without the "chr" prefix
        for region in regional_missense_constraint["regions"] or []:
            region["chrom"] = region["chrom"].removeprefix("chr")
        regional_missense_constraint_by_gene[row.gene_id] = regional_missense_constraint
    return regional_missense_constraint_by_gene


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--residues-path", required=True)
    parser.add_argument("--uniprot-features-path", required=True)
    parser.add_argument("--genes-path", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument(
        "--genes",
        nargs="+",
        default=DEMO_GENES,
        help="Gene symbols, each optionally followed by :UNIPROT_ID to choose its UniProt entry",
    )
    args = parser.parse_args()

    hl.init(quiet=True, spark_conf={"spark.hadoop.google.cloud.auth.type": "APPLICATION_DEFAULT"})

    genes = demo_genes(args.genes_path, args.genes)
    for gene_id, response in export_missense_constraint_3d(
        args.residues_path, args.uniprot_features_path, genes
    ).items():
        write_json(os.path.join(args.output_dir, f"missense_constraint_3d_{gene_id}.json"), response)
    for gene_id, regional_missense_constraint in export_regional_missense_constraint(args.genes_path, genes).items():
        write_json(
            os.path.join(args.output_dir, f"regional_missense_constraint_{gene_id}.json"),
            regional_missense_constraint,
        )
    for gene in genes:
        print(gene["symbol"], gene["gene_id"], gene["transcript_id"])


if __name__ == "__main__":
    main()
