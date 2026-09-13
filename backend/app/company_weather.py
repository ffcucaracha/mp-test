"""Import weather stations from the company API; never uses company field routes."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import WeatherStation
from .weather import WeatherProviderError


def sync_company_weather_stations(db: Session) -> int:
    base_url = os.getenv("COMPANY_API_URL", "").rstrip("/")
    email = os.getenv("COMPANY_API_EMAIL", "")
    password = os.getenv("COMPANY_API_PASSWORD", "")
    if not all((base_url, email, password)):
        raise WeatherProviderError("Company weather API is not configured")
    try:
        with httpx.Client(base_url=base_url, timeout=12.0, follow_redirects=True) as client:
            login = client.post("/api/auth/login", json={"email": email, "password": password})
            login.raise_for_status()
            response = client.get("/api/weather-sensor/api/devices")
            response.raise_for_status()
            devices = _device_list(response.json())
    except (httpx.HTTPError, ValueError) as exc:
        raise WeatherProviderError(f"Company station import failed: {exc}") from exc

    now = datetime.now(timezone.utc)
    imported = 0
    for device in devices:
        parsed = _parse_device(device)
        if not parsed:
            continue
        external_id, name, latitude, longitude = parsed
        station = db.scalar(select(WeatherStation).where(WeatherStation.external_id == external_id))
        if station is None:
            station = WeatherStation(external_id=external_id, name=name, latitude=latitude, longitude=longitude)
            db.add(station)
        else:
            station.name, station.latitude, station.longitude = name, latitude, longitude
        station.source_payload, station.synced_at = device, now
        imported += 1
    db.commit()
    return imported


def _device_list(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list): return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("data", "devices", "items", "results"):
            if isinstance(payload.get(key), list): return [x for x in payload[key] if isinstance(x, dict)]
    return []


def _parse_device(item: dict[str, Any]) -> tuple[str, str, float, float] | None:
    external_id = item.get("id") or item.get("device_id") or item.get("uuid")
    coordinates = item.get("coordinates") or item.get("location") or {}
    latitude = item.get("latitude", coordinates.get("latitude", coordinates.get("lat")))
    longitude = item.get("longitude", coordinates.get("longitude", coordinates.get("lng", coordinates.get("lon"))))
    try:
        return str(external_id), str(item.get("name") or item.get("title") or f"МС {external_id}"), float(latitude), float(longitude)
    except (TypeError, ValueError):
        return None
