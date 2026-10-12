"""Back up and apply the catalog repair to the local Shore and Edge containers."""
from pathlib import Path
from datetime import datetime, timezone
import subprocess

ROOT = Path(__file__).resolve().parents[2]
NODES = [('shore_product-postgres-1', 'product', 'productdb'),
         ('maritime-edge-postgres', 'edge_user', 'maritime_edge')]


def main():
    sql = (ROOT / 'scripts/database/catalog_audit_2026_10_12.sql').read_bytes()
    backups = ROOT / 'artifacts' / 'database-backups' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backups.mkdir(parents=True, exist_ok=True)
    # Complete both backups before mutating either node.
    for container, user, database in NODES:
        with (backups / f'{database}.dump').open('wb') as output:
            subprocess.run(['docker','exec',container,'pg_dump','-U',user,'-d',database,'-Fc'],
                           stdout=output, check=True)
    print(f'Backups: {backups}', flush=True)
    for container, user, database in NODES:
        result = subprocess.run(['docker','exec','-i',container,'psql','-U',user,'-d',database,
                                 '-v','ON_ERROR_STOP=1'],input=sql,capture_output=True)
        (backups / f'{database}-apply.log').write_bytes(result.stdout + result.stderr)
        if result.returncode:
            print(result.stderr.decode('utf-8',errors='replace'))
            raise SystemExit(result.returncode)
        print(f'{database}: committed', flush=True)


if __name__ == '__main__':
    main()
