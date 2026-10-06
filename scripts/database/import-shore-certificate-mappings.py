"""Manually carry forward known pre-reset certificate mappings by code, never by ID."""
import json
import runpy
from pathlib import Path

catalog_helpers = runpy.run_path(str(Path(__file__).with_name("import-shore-reference-catalog.py")))
query, rows = catalog_helpers["query"], catalog_helpers["rows"]

RANK_ALIASES = {"MAST": "MST", "BOSN": "BS", "AB": "ABD", "OILR": "ABE", "COOK": "C/Cook"}
CERT_ALIASES = {
    "CoC-MASTER": "COC", "CoC-Officer": "COC", "CoC-Engineer": "COC",
    "COC_II_2": "COC", "COC_II_1": "COC", "COC_III_2": "COC", "COC_III_1": "COC",
    "GMDSS-GOC": "GMDSS", "Fire-ADV": "AFF",
}


def main():
    container, user, database = "shore_product-postgres-1", "product", "productdb"
    current_ranks = {r["RankCode"]: r["Id"] for r in rows(container, user, database, "ranks")}
    current_certs = {r["CertificateCode"]: r["Id"] for r in rows(container, user, database, "certificates")}
    current_countries = {r["CountryCode"]: r["Id"] for r in rows(container, user, database, "countries")}
    old_ranks = {r["Id"]: r["RankCode"] for r in rows(container, user, "catalog_reference_review", "ranks")}
    old_certs = {r["Id"]: r["CertificateCode"] for r in rows(container, user, "catalog_reference_review", "certificates")}
    old_countries = {r["Id"]: r["CountryCode"] for r in rows(container, user, "catalog_reference_review", "countries")}
    sql, audit = ["BEGIN;"], {}
    for table, key, old_keys, current_keys, aliases in (
        ("rank_certificates", "RankId", old_ranks, current_ranks, RANK_ALIASES),
        ("country_certificates", "CountryId", old_countries, current_countries, {}),
    ):
        pairs, skipped = set(), set()
        for row in rows(container, user, "catalog_reference_review", table):
            old_key = old_keys[row[key]]
            old_cert = old_certs[row["CertificateId"]]
            new_key, new_cert = aliases.get(old_key, old_key), CERT_ALIASES.get(old_cert, old_cert)
            if new_key not in current_keys or new_cert not in current_certs:
                skipped.add(old_cert)
                continue
            pairs.add((current_keys[new_key], current_certs[new_cert]))
        for ref_id, cert_id in sorted(pairs):
            sql.append(f'INSERT INTO {table} ("{key}","CertificateId","CreatedAt","UpdatedAt") '
                f'VALUES ({ref_id},{cert_id},NOW(),NOW()) ON CONFLICT ("{key}","CertificateId") DO NOTHING;')
        audit[table] = {"recognized_pairs": len(pairs), "unmatched_old_certificate_codes": sorted(skipped)}
    sql.append("COMMIT;")
    query(container, user, database, "\n".join(sql))
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
