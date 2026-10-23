"""Regenerate the three capital regional shapes from the project snapshot.

Requires Shapely: python -m pip install shapely
"""

import json
import math
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from shapely.geometry import MultiPolygon, Polygon, box, mapping, shape
from shapely.ops import transform, unary_union

root = Path(__file__).resolve().parent.parent
source = (root / 'src/data/aredMapData.ts').read_text(encoding='utf-8')


def read_export(name):
    match = re.search(r'export const ' + name + r' = parse<[^\n]+?>\((".*?")\)', source, re.S)
    return json.loads(json.loads(match.group(1)))


def normalize(value):
    return ''.join(char for char in unicodedata.normalize('NFD', value.lower()) if unicodedata.category(char) != 'Mn')


regions = read_export('REGIONAIS')['features']
municipalities = read_export('MUN_BY_REGIONAL')
locations = read_export('SAO_PAULO_UNIT_LOCATIONS')
capital = next(feature for collection in municipalities.values() for feature in collection['features'] if normalize(feature['properties']['name']) == 'sao paulo')
codes = dict(re.findall(r"'(\d+)': '([^']+)'", (root / 'src/data/regionalByEtecCode.ts').read_text(encoding='utf-8')))
offers = json.loads((root / 'src/data/snapshots/2026.2/2026-06-05T20-22-00-03-00.json').read_text(encoding='utf-8'))['locais']
aliases = {'159': 'parque da juventude', '220': 'parque belem', '221': 'jardim angela', '253': 'jornalista roberto marinho', '260': 'santa ifigenia'}
points = defaultdict(list)
for offer in offers:
    if normalize(offer['municipio']) != 'sao paulo':
        continue
    code = str(int(offer['codigo_etec'].removeprefix('E')))
    regional = codes.get(code)
    match_name = aliases.get(code)
    label = normalize(offer['nome'])
    location = next((item for item in locations if item['match'] == match_name), None) if match_name else None
    if location is None:
        location = next((item for item in locations if item['match'] in label), None)
    if location and regional:
        points[regional].append((location['lon'], location['lat']))


def mercator(lon, lat, z=None):
    return math.radians(lon), math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def inverse(x, y, z=None):
    return math.degrees(x), math.degrees(2 * math.atan(math.exp(y)) - math.pi / 2)


city = transform(mercator, shape(capital['geometry']))
sites = {name: tuple(sum(mercator(*point)[axis] for point in coords) / len(coords) for axis in (0, 1)) for name, coords in points.items()}
print('sites', [(name, len(points[name]), tuple(round(v, 5) for v in site)) for name, site in sites.items()])
assert len(sites) == 3


def clip_halfplane(poly, site, other):
    ax, ay = site
    bx, by = other
    dx, dy = bx - ax, by - ay
    c = (bx * bx + by * by - ax * ax - ay * ay) / 2
    coords = list(poly.exterior.coords)
    result = []
    for i, current in enumerate(coords[:-1]):
        following = coords[i + 1]
        current_score = dx * current[0] + dy * current[1] - c
        next_score = dx * following[0] + dy * following[1] - c
        if current_score <= 0:
            result.append(current)
        if (current_score < 0 < next_score) or (current_score > 0 > next_score):
            t = current_score / (current_score - next_score)
            result.append((current[0] + t * (following[0] - current[0]), current[1] + t * (following[1] - current[1])))
    return Polygon(result) if len(result) >= 3 else Polygon()


extent = box(*city.bounds).buffer(.05).envelope
cells = {}
for name, site in sites.items():
    cell = extent
    for other_name, other_site in sites.items():
        if other_name != name:
            cell = clip_halfplane(cell, site, other_site)
    cells[name] = city.intersection(cell)

assert abs(unary_union(list(cells.values())).symmetric_difference(city).area) < 1e-12
assert all(a.intersection(b).area < 1e-12 for i, a in enumerate(cells.values()) for b in list(cells.values())[i + 1:])

output = {}
for feature in regions:
    name = feature['properties']['regional']
    if name not in cells:
        continue
    original = transform(mercator, shape(feature['geometry']))
    merged = original.difference(city).union(cells[name])
    if not merged.is_valid:
        merged = merged.buffer(0)
    assert merged.is_valid
    geographic = transform(inverse, merged)
    output[name] = geographic if geographic.is_valid else geographic.buffer(0)
    print(name, 'area old', round(original.area, 7), 'new', round(merged.area, 7), 'parts', len(getattr(merged, 'geoms', [merged])))

assert len(output) == 3
# The source regional boundaries overlap slightly. Preserve the existing draw order
# while ensuring that a point belongs to one hover target only.
ordered_names = [feature['properties']['regional'] for feature in regions if feature['properties']['regional'] in output]
for index, name in enumerate(ordered_names):
    later = unary_union([output[other] for other in ordered_names[index + 1:]]) if index + 1 < len(ordered_names) else None
    if later is not None:
        output[name] = output[name].difference(later)
    if not output[name].is_valid:
        output[name] = output[name].buffer(0)
    assert output[name].is_valid
# The legacy Leste polygon contains tiny detached remnants of the capital
# inside Noroeste and Sul. Assign each remnant to its surrounding regional so
# it does not draw an isolated outline or create a separate hover target.
leste_name = next(name for name in output if name.endswith('Leste'))
leste_parts = sorted(getattr(output[leste_name], 'geoms', [output[leste_name]]), key=lambda part: part.area, reverse=True)
for remnant in leste_parts[1:]:
    neighbor = min((name for name in output if name != leste_name), key=lambda name: remnant.distance(output[name]))
    output[leste_name] = output[leste_name].difference(remnant)
    output[neighbor] = output[neighbor].union(remnant)
for name, geometry in output.items():
    parts = getattr(geometry, 'geoms', [geometry])
    cleaned = [Polygon(part.exterior, [ring for ring in part.interiors if Polygon(ring).area >= 1e-7]) for part in parts]
    output[name] = cleaned[0] if len(cleaned) == 1 else MultiPolygon(cleaned)
for geometry in output.values():
    assert geometry.is_valid
(root / 'src/data/capitalRegionalGeometry.json').write_text(json.dumps({name: mapping(geometry) for name, geometry in output.items()}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
capital_shape = shape(capital['geometry'])
capital_sections = {}
for name, geometry in output.items():
    intersection = geometry.intersection(capital_shape)
    polygons = [part for part in getattr(intersection, 'geoms', [intersection]) if isinstance(part, Polygon) and part.area > 1e-10]
    capital_sections[name] = unary_union(polygons)
for geometry in capital_sections.values():
    assert geometry.is_valid and not geometry.is_empty
(root / 'src/data/capitalRegionalCityGeometry.json').write_text(json.dumps({name: mapping(geometry) for name, geometry in capital_sections.items()}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
