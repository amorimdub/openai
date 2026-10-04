"""Validate raw acquisition metadata only; never transform source payloads."""
from pathlib import Path
import argparse, csv, datetime, hashlib, io, json, math, re, zipfile

SOURCES = ['ppr', 'cso-sales', 'rtb-cso', 'nta', 'sport-ireland-clubs', 'sport-ireland-activities', 'osm-geofabrik']

def verify(root, day):
    for source in SOURCES:
        directory = root / source / day
        manifest_path = directory / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        integrity = manifest.setdefault('integrity', {})
        failures = []
        # An intentionally recorded failed provenance URL may be superseded by a
        # successful replacement, but a missing payload must never be complete.
        for response in manifest['responses']:
            if response['status'] != 'downloaded':
                if not response.get('superseded_by'):
                    failures.append({'file': response['file'], 'reason': 'not downloaded'})
                continue
            path = directory / response['file']
            digest = hashlib.sha256()
            with path.open('rb') as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                    digest.update(chunk)
            okay = path.stat().st_size == response['bytes'] and digest.hexdigest() == response['sha256']
            response['local_size_sha256_verified'] = okay
            if not okay:
                failures.append({'file': response['file'], 'reason': 'local bytes/SHA256 mismatch'})
            if response.get('content_length_matches') is False:
                failures.append({'file': response['file'], 'reason': 'HTTP Content-Length mismatch'})
        if source == 'ppr':
            with zipfile.ZipFile(directory / 'PPR-ALL.zip') as archive:
                with archive.open('PPR-ALL.csv') as handle:
                    reader = csv.reader(io.TextIOWrapper(handle, encoding='cp1252', newline=''))
                    integrity['raw_csv_fields'] = next(reader)
                    count = 0
                    first = last = None
                    for row in reader:
                        count += 1
                        # Date parsing records source temporal extent only; no
                        # purchase values or statistics are calculated.
                        stamp = datetime.datetime.strptime(row[0], '%d/%m/%Y').date()
                        first = stamp if first is None else min(first, stamp)
                        last = stamp if last is None else max(last, stamp)
                    integrity['downloaded_records'] = count
                    integrity['sale_date_extent'] = {'first': first.isoformat(), 'last': last.isoformat()}
            integrity['expected_records'] = None
            integrity['expected_records_note'] = 'Publisher does not advertise an independent bulk row total; CRC and full member enumeration verified.'
        if source in ('ppr', 'nta') and integrity.get('zip_crc_error') is not None:
            failures.append({'reason': 'ZIP CRC failure', 'member': integrity['zip_crc_error']})
        if source in ('cso-sales', 'rtb-cso'):
            for response in manifest['responses']:
                if response['file'] not in ['HPM05.json', 'HPM07.json', 'HPM08.json', 'HPM02.json', 'RIQ02.json']:
                    continue
                body = json.loads((directory / response['file']).read_text())
                valid = body.get('class') == 'dataset' and isinstance(body.get('dimension'), dict) and isinstance(body.get('value'), list)
                expected = math.prod(body.get('size', []))
                actual = len(body.get('value', []))
                response['json_stat_dataset_verified'] = valid and expected == actual
                response['expected_cells'] = expected
                response['downloaded_cells'] = actual
                response['source_updated'] = body.get('updated')
                times = {}
                for key, dimension in body.get('dimension', {}).items():
                    if key.startswith('TLIST'):
                        index = dimension.get('category', {}).get('index', {})
                        ordered = sorted(index, key=index.get) if isinstance(index, dict) else index
                        times[key] = {'first': ordered[0] if ordered else None, 'last': ordered[-1] if ordered else None, 'count': len(ordered)}
                response['period_metadata'] = times
                if not response['json_stat_dataset_verified']:
                    failures.append({'file': response['file'], 'reason': 'invalid JSON-stat dataset or incomplete value vector'})
        if source == 'nta':
            naptan = json.loads((directory / 'NaPTAN.json').read_text())
            integrity['naptan_downloaded_stop_records'] = len(naptan['NaPTAN']['StopPoints']['StopPoint'])
            integrity['naptan_expected_records'] = None
            integrity['naptan_top_level_metadata'] = {k: v for k, v in naptan['NaPTAN'].items() if k.startswith('@')}
            with zipfile.ZipFile(directory / 'GTFS_All.zip') as archive:
                with archive.open('stops.txt') as handle:
                    reader = csv.DictReader(io.TextIOWrapper(handle, encoding='utf-8-sig', newline=''))
                    integrity['gtfs_stop_fields'] = reader.fieldnames
                    integrity['gtfs_downloaded_stop_records'] = sum(1 for _ in reader)
                with archive.open('feed_info.txt') as handle:
                    integrity['gtfs_feed_metadata'] = list(csv.DictReader(io.TextIOWrapper(handle, encoding='utf-8-sig', newline='')))
            integrity['schedule_period_note'] = 'feed_info is publisher metadata; actual calendar validity and per-service coverage must be assessed during later parsing.'
        if source.startswith('sport-ireland-') and not manifest['dataset'].get('complete'):
            failures.append({'reason': 'pagination count/unique ID/edit metadata verification failed'})
        if source == 'osm-geofabrik' and not integrity.get('publisher_md5_matches'):
            failures.append({'reason': 'publisher MD5 mismatch or missing MD5 evidence'})
        if source == 'osm-geofabrik':
            match = re.search(r'contains all OSM data up to ([0-9TZ:-]+)', (directory / 'extract-catalogue.html').read_text())
            integrity['catalogue_data_through_utc'] = match.group(1).rstrip('.') if match else None
        manifest['verification_utc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        manifest['integrity_failures'] = failures
        manifest['acquisition_complete'] = not failures
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
        print(source, 'COMPLETE' if not failures else 'INCOMPLETE', 'payload_bytes', sum(r.get('bytes', 0) for r in manifest['responses']), flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', default=datetime.datetime.now(datetime.timezone.utc).date().isoformat())
    arguments = parser.parse_args()
    datetime.date.fromisoformat(arguments.date)
    verify(Path(__file__).resolve().parents[3] / 'data' / 'raw', arguments.date)
