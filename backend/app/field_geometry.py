from __future__ import annotations

from math import cos, radians
from typing import Any

EARTH_RADIUS_M = 6_371_000.0


def square_polygon(latitude: float, longitude: float, delta: float = 0.0005) -> dict[str, Any]:
    ring = [
        [longitude - delta, latitude - delta],
        [longitude + delta, latitude - delta],
        [longitude + delta, latitude + delta],
        [longitude - delta, latitude + delta],
        [longitude - delta, latitude - delta],
    ]
    return {"type": "Polygon", "coordinates": [ring]}


def normalize_polygon(geometry: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(geometry, dict) or geometry.get("type") != "Polygon":
        raise ValueError("geometry must be a GeoJSON Polygon")

    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or not coordinates or not isinstance(coordinates[0], list):
        raise ValueError("Polygon coordinates are required")

    ring: list[list[float]] = []
    for point in coordinates[0]:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            raise ValueError("Each polygon point must contain longitude and latitude")
        lon = float(point[0])
        lat = float(point[1])
        if not -180 <= lon <= 180 or not -90 <= lat <= 90:
            raise ValueError("Polygon point is outside valid longitude/latitude bounds")
        ring.append([round(lon, 7), round(lat, 7)])

    if len(ring) < 3:
        raise ValueError("A field polygon needs at least 3 points")
    if ring[0] != ring[-1]:
        ring.append(ring[0].copy())
    if len(ring) < 4:
        raise ValueError("A closed field polygon needs at least 4 coordinate entries")

    return {"type": "Polygon", "coordinates": [ring]}


def polygon_centroid(geometry: dict[str, Any]) -> tuple[float, float]:
    polygon = normalize_polygon(geometry)
    ring = polygon["coordinates"][0][:-1]
    mean_lat = sum(point[1] for point in ring) / len(ring)
    lat0 = radians(mean_lat)

    projected = [
        (
            EARTH_RADIUS_M * radians(point[0]) * cos(lat0),
            EARTH_RADIUS_M * radians(point[1]),
        )
        for point in ring
    ]

    twice_area = 0.0
    cx = 0.0
    cy = 0.0
    for index, (x1, y1) in enumerate(projected):
        x2, y2 = projected[(index + 1) % len(projected)]
        cross = x1 * y2 - x2 * y1
        twice_area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross

    if abs(twice_area) < 1e-9:
        longitude = sum(point[0] for point in ring) / len(ring)
        latitude = sum(point[1] for point in ring) / len(ring)
        return round(latitude, 7), round(longitude, 7)

    area = twice_area / 2.0
    cx /= 6.0 * area
    cy /= 6.0 * area
    longitude = cx / (EARTH_RADIUS_M * cos(lat0))
    latitude = cy / EARTH_RADIUS_M
    return round(latitude * 180.0 / 3.141592653589793, 7), round(longitude * 180.0 / 3.141592653589793, 7)


def polygon_area_ha(geometry: dict[str, Any]) -> float:
    polygon = normalize_polygon(geometry)
    ring = polygon["coordinates"][0][:-1]
    mean_lat = sum(point[1] for point in ring) / len(ring)
    lat0 = radians(mean_lat)
    projected = [
        (
            EARTH_RADIUS_M * radians(point[0]) * cos(lat0),
            EARTH_RADIUS_M * radians(point[1]),
        )
        for point in ring
    ]
    twice_area = 0.0
    for index, (x1, y1) in enumerate(projected):
        x2, y2 = projected[(index + 1) % len(projected)]
        twice_area += x1 * y2 - x2 * y1
    return round(abs(twice_area) / 2.0 / 10_000.0, 2)


def normalize_field_geometry(
    geometry: dict[str, Any] | None,
    latitude: float,
    longitude: float,
    area_ha: float | None = None,
) -> tuple[dict[str, Any], float, float, float | None]:
    if geometry is None:
        normalized = square_polygon(latitude, longitude)
        return normalized, latitude, longitude, area_ha

    normalized = normalize_polygon(geometry)
    centroid_lat, centroid_lon = polygon_centroid(normalized)
    computed_area = polygon_area_ha(normalized)
    return normalized, centroid_lat, centroid_lon, computed_area
