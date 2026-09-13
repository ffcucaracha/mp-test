from __future__ import annotations

import argparse
from pathlib import Path
from pprint import pformat
from xml.etree import ElementTree

from app.field_geometry import polygon_area_ha, polygon_centroid


KML_NAMESPACE = {"kml": "http://www.opengis.net/kml/2.2"}

# The source KML contains one real agricultural enterprise. For the demo we split
# its fields into compact geographical groups so every test user represents a
# separate neighbouring farm instead of owning contours scattered over the map.
OWNER_BY_SOURCE_INDEX = {
    1: 1,
    7: 1,
    9: 1,
    10: 1,
    11: 1,
    17: 1,
    27: 1,
    28: 1,
    39: 1,
    40: 1,
    4: 2,
    26: 2,
    29: 2,
    30: 2,
    31: 2,
    32: 2,
    35: 2,
    36: 2,
    41: 2,
    47: 2,
    8: 3,
    19: 3,
    33: 3,
    34: 3,
    2: 4,
    3: 4,
    5: 4,
    6: 4,
    13: 4,
    14: 4,
    15: 4,
    16: 4,
    18: 4,
    37: 4,
    52: 4,
    12: 5,
    21: 5,
    22: 5,
    23: 5,
    24: 5,
    25: 5,
    20: 5,
    38: 5,
    42: 5,
    43: 5,
    44: 5,
    46: 5,
    48: 5,
    50: 5,
    51: 5,
    45: 6,
    49: 6,
}

# IDs 1-7 are referenced by the story-driven demo seed (posts, alerts and visit
# requests). Keep one suitable field for each scenario at those stable IDs.
PRIMARY_SOURCE_ORDER = [1, 10, 36, 8, 5, 12, 45]
PRIMARY_PRIVACY = ["A", "B", "B", "A", "A", "B", "A"]


def _coordinates(value: str) -> list[list[float]]:
    return [
        [round(float(parts[0]), 6), round(float(parts[1]), 6)]
        for token in value.split()
        if len(parts := token.split(",")) >= 2
    ]


def _parse_fields(kml_path: Path) -> dict[int, dict]:
    root = ElementTree.parse(kml_path).getroot()
    fields: dict[int, dict] = {}

    for source_index, placemark in enumerate(root.findall(".//kml:Placemark", KML_NAMESPACE), start=1):
        name = placemark.findtext("kml:name", namespaces=KML_NAMESPACE)
        crop = placemark.findtext(
            "kml:ExtendedData/kml:Data[@name='crop']/kml:value",
            namespaces=KML_NAMESPACE,
        )
        raw_coordinates = placemark.findtext(
            ".//kml:outerBoundaryIs/kml:LinearRing/kml:coordinates",
            namespaces=KML_NAMESPACE,
        )
        if not name or not crop or not raw_coordinates:
            raise ValueError(f"Placemark #{source_index} has incomplete field data")

        geometry = {"type": "Polygon", "coordinates": [_coordinates(raw_coordinates)]}
        latitude, longitude = polygon_centroid(geometry)
        fields[source_index] = {
            "source_index": source_index,
            "name": name.strip(),
            "crop": crop.strip(),
            "latitude": latitude,
            "longitude": longitude,
            "area_ha": round(polygon_area_ha(geometry), 1),
            "geometry": geometry,
        }

    expected = set(range(1, len(fields) + 1))
    if set(OWNER_BY_SOURCE_INDEX) != expected:
        missing = sorted(expected - set(OWNER_BY_SOURCE_INDEX))
        extra = sorted(set(OWNER_BY_SOURCE_INDEX) - expected)
        raise ValueError(f"Owner mapping does not match KML placemarks: missing={missing}, extra={extra}")
    return fields


def _seed_fields(source_fields: dict[int, dict]) -> list[dict]:
    remaining = sorted(set(source_fields) - set(PRIMARY_SOURCE_ORDER))
    source_order = [*PRIMARY_SOURCE_ORDER, *remaining]
    fields = []

    for field_id, source_index in enumerate(source_order, start=1):
        source = source_fields[source_index]
        privacy_variant = (
            PRIMARY_PRIVACY[field_id - 1]
            if field_id <= len(PRIMARY_PRIVACY)
            else ("B" if source_index % 3 == 0 or source_index == 49 else "A")
        )
        fields.append(
            {
                "id": field_id,
                "owner_id": OWNER_BY_SOURCE_INDEX[source_index],
                "name": source["name"],
                "crop": source["crop"],
                "latitude": source["latitude"],
                "longitude": source["longitude"],
                "area_ha": source["area_ha"],
                "privacy_variant": privacy_variant,
                "geometry": source["geometry"],
            }
        )
    return fields


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate demo fields from the supplied KML file")
    parser.add_argument("kml", type=Path, help="Path to 03-09-2026_fields.kml")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "app" / "seed_fields.py",
    )
    args = parser.parse_args()

    fields = _seed_fields(_parse_fields(args.kml))
    header = (
        "# Generated from 03-09-2026_fields.kml by scripts/generate_seed_fields.py.\n"
        "# Coordinates use GeoJSON order: [longitude, latitude].\n"
        "# Field IDs 1-7 are stable because the main demo seed references them.\n\n"
    )
    args.output.write_text(
        f"{header}SEED_FIELDS = {pformat(fields, width=120, sort_dicts=False)}\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
