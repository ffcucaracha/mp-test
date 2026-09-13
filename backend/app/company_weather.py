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

MAX_STATION_DISTANCE_KM = 50


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


def latest_company_weather(station_id: str) -> dict[str, Any]:
    """Read current observations for a station UUID; company field routes are never used."""
    base_url = os.getenv("COMPANY_API_URL", "").rstrip("/")
    email = os.getenv("COMPANY_API_EMAIL", "")
    password = os.getenv("COMPANY_API_PASSWORD", "")
    if not all((base_url, email, password)):
        raise WeatherProviderError("Company weather API is not configured")
    try:
        with httpx.Client(base_url=base_url, timeout=12.0, follow_redirects=True) as client:
            login = client.post("/api/auth/login", json={"email": email, "password": password})
            login.raise_for_status()
            response = client.get(f"/api/weather-sensor/api/v1/stations/{station_id}/latest")
            response.raise_for_status()
            payload = response.json().get("data") or {}
    except (httpx.HTTPError, ValueError) as exc:
        raise WeatherProviderError(f"Company latest weather request failed: {exc}") from exc
    weather = payload.get("weather_data") or {}
    observed_at = payload.get("station_data", {}).get("datetime") or payload.get("last_seen") or payload.get("timestamp")
    if weather.get("t") is None or not observed_at:
        raise WeatherProviderError("Company station returned no current weather")
    return {
        "temperature_c": float(weather["t"]), "apparent_temperature_c": _float_or_none(weather.get("tp")),
        "wind_speed_kmh": _float_or_none(weather.get("wv")), "wind_gust_kmh": _float_or_none(weather.get("wm")),
        "precipitation_mm": _float_or_none(weather.get("rn")), "observed_at": observed_at,
    }


def _device_list(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("devices", "items", "results", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                return [x for x in value if isinstance(x, dict)]
            # The company gateway can wrap the service response as data.devices.
            if isinstance(value, dict):
                nested = _device_list(value)
                if nested:
                    return nested
    return []


def _parse_device(item: dict[str, Any]) -> tuple[str, str, float, float] | None:
    external_id = item.get("id") or item.get("device_id") or item.get("uuid")
    coordinates = item.get("coordinates") or item.get("location") or {}
    latitude = item.get("latitude", item.get("lat", coordinates.get("latitude", coordinates.get("lat"))))
    longitude = item.get("longitude", item.get("lon", coordinates.get("longitude", coordinates.get("lng", coordinates.get("lon")))))
    try:
        return str(external_id), str(item.get("name") or item.get("title") or f"МС {external_id}"), float(latitude), float(longitude)
    except (TypeError, ValueError):
        return None


def _float_or_none(value: Any) -> float | None:
    return float(value) if value is not None else None
