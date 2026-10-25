"""Import the requested shore crew and sample certificate metadata (no files).

Explicit manual import only; existing crew are never overwritten. All writes and
checks share one PostgreSQL transaction. Certificate metadata is labeled sample.
"""
import calendar
import json
import random
import subprocess
import uuid
from datetime import date, timedelta


DATA = """1|Nguyễn Ngọc Quân|31/3/1983|HPG-09202-02|E03569309|A|170|82|Vũ Thúy An|Spouse|0327092260
2|Vũ Mạnh Hùng|28/03/1979|HPG-07292-02|K0544688|A|165|57|Vũ Mạnh Hiếu|Child|0916371200
3|Nguyễn Hải Đăng|21/02/1982|HPG-09217-02|C3020168|A|173|66|Đào Thị Lan|Spouse|0966371286
4|Nguyễn Đăng Quân|15/12/1983|HPG-17173-02|C5448279|A|170|65|Nguyễn Thị Huế|Spouse|0936885786
5|Nguyễn Văn Trình|22/09/1983|VN005603-01|C9999470|O|168|67|Trần Thị Nhuê|Spouse|0343292988
6|Hoàng Ngọc Tú|11/03/1982|HPG-14916-02|C4271463|A|169|67|Nguyễn Minh Trang|Spouse|0393962875
7|Nguyễn Văn Hiệp|26/01/1994|HPG-40685-01|P03377141|O|166|73|Bùi Thị Mỹ Linh|Spouse|0366228561
8|Nguyễn Hữu Tiến|07/11/1991|HPG-40633-01|P02662261|A|170|61|Nguyễn Thị Thúy|Spouse|0942703998
9|Phạm Đăng Tuân|04/09/1982|HPG-10047-02|C3021757|B|165|54|Phạm Thị Quỳnh|Spouse|0945508777
10|Bùi Văn Trường|08/01/1991|VN039519-01|P00165593|A|173|70|Đỗ Thị Thu Phương|Spouse|0966780625
11|Nguyễn Văn Đại|05/02/1991|VN011683-01|C6287191|O|167|65|Nguyễn Thị Xuân|Spouse|0965594802
12|Lê Trọng Thoại|20/01/1999|VN007008-01|C3978597|AB|176|87|Lê Khánh Phố|Father|0901841998
13|Phạm Thế Vinh|08/09/1971|VN048769-01|P03258953|O|170|70|Trần Thị Thu|Spouse|0398236633
14|Nguyễn Thành Đạt|04/11/2004|VN040969-01|P00323346|B|167|61|Nguyễn Ánh Dương|Father|0966986363
15|Lại Văn Thành|09/09/1982|VN010912-01|C1313928|B|162|57|Trịnh Thị Hồng|Spouse|0934664474
16|Bùi Trọng Tập|20/02/1984|HPG-13111|C4110116|B|170|68|Lê Thị Phương|Spouse|0974280927
17|Nguyễn Văn Thọ|17/08/1985|VN028082-01|C9853209|O|165|52|Đồng Thị Tiến|Spouse|0383786351
18|Nguyễn Kim Tuyến|26/02/1988|VN040428-01|E00138669|B|168|66|Bùi Thị Vân|Spouse|0969855608
19|Đỗ Văn Hùng|05/11/1988|VN032790-01|K0097176|O|162|60|Hoàng Thị Tâm|Spouse|0985629500
20|Nguyễn Văn Thùy|20/02/1969|HPG-10129|P03871879|O|167|61|Lê Thị Oanh|Spouse|0338520667"""


def query(sql):
    result = subprocess.run(
        ["docker", "exec", "-i", "shore_product-postgres-1", "psql", "-X", "-At",
         "-v", "ON_ERROR_STOP=1", "-U", "product", "-d", "productdb"],
        input=sql.encode("utf-8"), capture_output=True,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.decode("utf-8"))
    return result.stdout.decode("utf-8")


def quote(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def insert(table, values):
    columns = ",".join('"' + key + '"' for key in values)
    return f"INSERT INTO {table} ({columns}) VALUES ({','.join(quote(v) for v in values.values())});"


def add_months(day, months):
    year, month = divmod(day.year * 12 + day.month - 1 + months, 12)
    return date(year, month + 1, min(day.day, calendar.monthrange(year, month + 1)[1]))


def main():
    certificates = json.loads(query('SELECT json_agg(t) FROM certificates t WHERE "IsActive" AND COALESCE("Category",\'\') <> \'DOCUMENT\';'))
    country_id = int(query('SELECT "Id" FROM countries WHERE "CountryCode" IN (\'VN\',\'VNM\');').strip())
    rng = random.Random(20261012)
    today = date(2026, 10, 12)
    timestamp = today.isoformat() + "T00:00:00Z"
    sql = ["BEGIN;", "LOCK TABLE crew_members, crew_certificates, crew_member_documents IN SHARE ROW EXCLUSIVE MODE;"]
    records = []
    for line in DATA.splitlines():
        number, name, birth, book, passport, blood, height, weight, kin, relation, phone = line.split("|")
        crew_id, member_id = "CREW" + number, str(uuid.uuid4())
        day, month, year = map(int, birth.split("/"))
        label = {"Spouse": "Vợ", "Child": "Con", "Father": "Bố"}[relation]
        # No rank, vessel, or employment dates were supplied.
        values = dict(Id=member_id, CrewId=crew_id, FullName=name,
                      DateOfBirth=date(year, month, day).isoformat() + "T00:00:00Z",
                      IsOnboard=False, CountryId=country_id, BloodGroup=blood,
                      Height=int(height), Weight=int(weight),
                      EmergencyContact=f"{kin} ({label}) - {phone}",
                      NextOfKinName=kin, NextOfKinRelation=relation, NextOfKinPhone=phone,
                      Status="Draft", PoolStatus="Available", IsSynced=False,
                      OriginNode="SHORE", SyncVersion=0, CreatedAt=timestamp, UpdatedAt=timestamp)
        sql.append(insert("crew_members", values))
        for category, kind, document_number in (("travel", "passport", passport), ("seafarer", "seaman_book", book)):
            sql.append(insert("crew_member_documents", dict(
                Id=str(uuid.uuid4()), CrewMemberId=member_id, Category=category,
                DocumentType=kind, DocumentNumber=document_number, CountryId=country_id,
                CreatedAt=timestamp, UpdatedAt=timestamp)))
        selected = rng.sample(certificates, rng.randint(6, min(10, len(certificates))))
        for cert in selected:
            months = cert["ValidityPeriodMonths"]
            # Short validity types are issued more recently so they remain valid.
            issue = today - timedelta(days=rng.randint(30, min(540, (months or 60) * 20)))
            expiry = add_months(issue, months) if months and months > 0 else date(9999, 12, 31)
            sql.append(insert("crew_certificates", dict(
                CrewMemberId=member_id, CertificateId=cert["Id"],
                CertificateNumber=f"DEMO-{crew_id}-{cert['Id']}-{rng.randint(10000, 99999)}",
                IssueDate=issue.isoformat() + "T00:00:00Z", ExpiryDate=expiry.isoformat() + "T00:00:00Z",
                IssuingAuthority=cert["IssuingAuthority"], CountryId=country_id,
                Status="VALID", Notes="Dữ liệu mẫu ngẫu nhiên theo yêu cầu; chưa xác minh chứng chỉ thực tế."
                + (" Danh mục không quy định thời hạn; dùng 9999-12-31 cho không thời hạn." if not months else ""),
                IsSynced=False, OriginNode="SHORE", SyncVersion=0, CreatedAt=timestamp, UpdatedAt=timestamp)))
        records.append(dict(crew_id=crew_id, member_id=member_id, certificates=len(selected), values=values,
                            passport=passport, book=book))
    # Assertions run before COMMIT, so any mismatch rolls back the entire import.
    for record in records:
        predicates = " AND ".join(f'"{key}" IS NOT DISTINCT FROM {quote(value)}' for key, value in record["values"].items())
        member = quote(record["member_id"])
        sql.append(f"""DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM crew_members WHERE {predicates})
            OR (SELECT count(*) FROM crew_member_documents WHERE "CrewMemberId"={member}
                AND "FileUrl" IS NULL AND "DocumentNumber" IN ({quote(record['passport'])},{quote(record['book'])})) <> 2
            OR (SELECT count(*) FROM crew_certificates WHERE "CrewMemberId"={member}
                AND "DocumentFilePath" IS NULL AND "Status"='VALID' AND "ExpiryDate">'2026-10-12'
                AND "IssueDate"<"ExpiryDate") <> {record['certificates']}
            THEN RAISE EXCEPTION 'Import verification failed for {record['crew_id']}'; END IF;
            END $$;""")
    sql.append("COMMIT;")
    query("\n".join(sql))
    print(json.dumps(dict(crew_members=len(records), identity_documents=len(records) * 2,
                         certificates=sum(r["certificates"] for r in records),
                         certificate_counts={r["crew_id"]: r["certificates"] for r in records}), indent=2))


if __name__ == "__main__":
    main()
