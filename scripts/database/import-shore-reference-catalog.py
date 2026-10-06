"""Manually import reference catalogs from isolated pre-reset backup databases.

Requires catalog_reference_review on Shore and edge_catalog_reference_review on Edge.
This script is never called by application startup or Docker initialization.
"""
import json
import subprocess


def query(container, user, database, sql):
    result = subprocess.run(
        ["docker", "exec", "-i", container, "psql", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", database],
        input=sql.encode("utf-8"), capture_output=True, check=True,
    )
    return result.stdout.decode("utf-8")


def rows(container, user, database, table):
    return json.loads(query(container, user, database,
        f"SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM {table} t;"))


def quote(value):
    return "'" + value.replace("'", "''") + "'"


CATEGORY_NAMES = {
    "ENGINE": "Phụ tùng động cơ", "ELECTRICAL": "Vật tư điện", "PAINT-COAT": "Sơn & chống ăn mòn",
    "LUBRICANTS": "Dầu mỡ & chất lỏng", "SAFETY": "Thiết bị an toàn", "TOOLS": "Dụng cụ & công cụ",
    "DECK-SUPPLIES": "Vật tư boong", "CLEANING": "Vật tư làm sạch", "OFFICE": "Văn phòng & văn phòng phẩm",
    "ENGINE-FILTERS": "Lọc động cơ", "ENGINE-GASKETS": "Gioăng & đệm", "ENGINE-BEARINGS": "Ổ trục & bạc",
    "ENGINE-VALVES": "Van & xupap", "ENGINE-COOLING": "Hệ thống làm mát", "ELEC-LIGHTING": "Chiếu sáng",
    "ELEC-CABLES": "Cáp & dây điện", "ELEC-SWITCHES": "Công tắc & ổ cắm", "ELEC-BATTERIES": "Ắc quy & pin",
    "PLUMBING": "Dụng cụ ống nối", "PAINT-PRIMERS": "Sơn lót", "PAINT-TOPCOATS": "Sơn phủ",
    "PAINT-SUPPLIES": "Phụ kiện sơn", "LUBE-ENGINE-OIL": "Dầu động cơ", "LUBE-GREASE": "Mỡ bôi trơn",
    "LUBE-HYDRAULIC": "Dầu thủy lực", "LUBE-COOLANT": "Chất làm mát", "SAFETY-PPE": "Bảo hộ lao động",
    "SAFETY-FIRE": "Phòng cháy chữa cháy", "SAFETY-MEDICAL": "Y tế & sơ cứu",
}
ITEM_NAMES = {
    "CLEAN-DEGREASER-001": "Dung dịch tẩy dầu mỡ", "CLEAN-MOP-SET-001": "Bộ cây lau nhà & xô",
    "CLEAN-RAGS-001": "Giẻ lau cotton tái chế", "COOLANT-ENGINE-001": "Nước làm mát động cơ",
    "ELEC-BATTERY-START-001": "Ắc quy khởi động 12V 200Ah", "ELEC-CABLE-10MM-001": "Cáp điện 10mm² - đỏ",
    "ELEC-CABLE-4MM-001": "Cáp điện 4mm² - đen", "ELEC-LED-BULKHEAD-001": "Đèn LED Bulkhead 15W",
    "ELEC-NAV-LIGHT-001": "Đèn tín hiệu hàng hải", "ENG-BEARING-BB-001": "Ổ bi bơm nước",
    "ENG-BEARING-MAIN-001": "Bạc trục khuỷu động cơ chính", "ENG-FILTER-AIR-001": "Lọc không khí động cơ chính",
    "ENG-FILTER-FUEL-001": "Lọc nhiên liệu động cơ chính", "ENG-FILTER-OIL-001": "Lọc dầu động cơ chính",
    "ENG-GASKET-HEAD-001": "Gioăng đầu máy", "ENG-GASKET-ORING-001": "Bộ O-Ring các cỡ",
    "GREASE-MARINE-001": "Mỡ tàu biển chống nước", "GREASE-MP-LITHIUM-001": "Mỡ lithium đa năng",
    "OIL-2STROKE-001": "Dầu động cơ 2 thì", "OIL-ENGINE-15W40-001": "Dầu động cơ diesel 15W-40",
    "OIL-HYDRAULIC-46-001": "Dầu thủy lực ISO 46", "PAINT-BRUSH-SET-001": "Bộ cọ sơn nhiều cỡ",
    "PAINT-DECK-GREY-001": "Sơn boong chống trượt - xám", "PAINT-PRIMER-EPOXY-001": "Sơn lót epoxy 2 thành phần",
    "PAINT-PRIMER-ZINC-001": "Sơn lót giàu kẽm", "PAINT-ROLLER-SET-001": "Bộ lăn sơn chuyên dụng",
    "PAINT-THINNER-001": "Dung môi pha sơn epoxy", "PAINT-TOPCOAT-GREY-001": "Sơn phủ ngoại thất - xám nhạt",
    "SAFETY-BLANKET-001": "Chăn chữa cháy 1.2m x 1.8m", "SAFETY-BOOTS-001": "Giày bảo hộ cổ cao",
    "SAFETY-EXTINGUISHER-001": "Bình chữa cháy CO2 5kg", "SAFETY-FIRSTAID-001": "Hộp sơ cứu loại A",
    "SAFETY-GLOVES-001": "Găng tay chống dầu", "SAFETY-HELMET-001": "Mũ bảo hộ màu vàng",
    "SAFETY-VEST-001": "Áo phao cứu sinh", "TOOL-SOCKET-SET-001": 'Bộ đầu tuýp 1/2" Drive',
    "TOOL-WRENCH-SET-001": "Bộ cờ lê 8-32mm",
}


def main():
    sql = ["BEGIN;", 'ALTER TABLE certificates ADD COLUMN IF NOT EXISTS "IssuingAuthority" character varying(200);',
        '''UPDATE certificates SET "IssuingAuthority" = trim(split_part(regexp_replace("Description", '^Cấp bởi: ', ''), '. Thời hạn', 1)),
        "Category" = CASE "CertificateCode" WHEN 'COC' THEN 'COMPETENCY' WHEN 'PP' THEN 'DOCUMENT'
        WHEN 'SB' THEN 'DOCUMENT' WHEN 'VACC' THEN 'MEDICAL'
        WHEN 'BRM' THEN 'PROFICIENCY' WHEN 'ERM' THEN 'PROFICIENCY' WHEN 'RP' THEN 'PROFICIENCY'
        WHEN 'ECDIS' THEN 'PROFICIENCY' WHEN 'ARPA' THEN 'PROFICIENCY' ELSE 'SAFETY' END,
        "UpdatedAt" = NOW() WHERE "CertificateCode" IN
        ('COC','BST','GMDSS','PP','SB','BRM','ERM','SSO','AFF','RB&FRB','MF','RP','ECDIS','ARPA','VACC');''']
    counts = {}
    for table in ("countries", "ports", "material_categories", "material_items"):
        data = rows("shore_product-postgres-1", "product", "catalog_reference_review", table)
        for row in data:
            if table == "material_categories":
                row["Name"] = CATEGORY_NAMES[row["CategoryCode"]]
                row["Description"] = row["Name"]
            if table == "material_items":
                row["Name"] = ITEM_NAMES[row["ItemCode"]]
            if "OriginNode" in row:
                row["OriginNode"] = "SHORE"
            if "IsSynced" in row:
                row["IsSynced"] = False
            sql.append(f"INSERT INTO {table} SELECT (json_populate_record(NULL::{table}, {quote(json.dumps(row, ensure_ascii=False))}::json)).* ON CONFLICT DO NOTHING;")
        counts[table] = len(data)
        if table != "material_items":
            sql.append(f"SELECT setval(pg_get_serial_sequence('{table}', 'Id'), COALESCE((SELECT max(\"Id\") FROM {table}), 1), EXISTS(SELECT 1 FROM {table}));")
    report_types = rows("maritime-edge-postgres", "edge_user", "edge_catalog_reference_review", "report_types")
    assert {r["type_code"] for r in report_types} == {"NOON", "DEPARTURE", "ARRIVAL", "BUNKER", "POSITION"}
    for row in report_types:
        converted = {"".join(p.capitalize() for p in key.split("_")): val for key, val in row.items()}
        sql.append(f"INSERT INTO report_types SELECT (json_populate_record(NULL::report_types, {quote(json.dumps(converted, ensure_ascii=False))}::json)).* ON CONFLICT (\"TypeCode\") DO NOTHING;")
    sql.append("SELECT setval(pg_get_serial_sequence('report_types', 'Id'), (SELECT max(\"Id\") FROM report_types));")
    sql.append("COMMIT;")
    query("shore_product-postgres-1", "product", "productdb", "\n".join(sql))
    print(json.dumps({**counts, "report_types": len(report_types)}, indent=2))


if __name__ == "__main__":
    main()
