from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx


class WeatherProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class WeatherHour:
    time: datetime
    temperature_c: float
    apparent_temperature_c: float | None = None
    precipitation_probability: int | None = None
    wind_speed_kmh: float | None = None


@dataclass(frozen=True)
class WeatherForecast:
    provider: str
    latitude: float
    longitude: float
    hours: list[WeatherHour]


class WeatherProvider(ABC):
    """Interface for weather data providers used by product logic."""

    name: str

    @abstractmethod
    def forecast(self, latitude: float, longitude: float, hours: int = 72) -> WeatherForecast:
        raise NotImplementedError


class OpenMeteoWeatherProvider(WeatherProvider):
    name = "open-meteo"

    def __init__(self, base_url: str | None = None, timeout_seconds: float = 8.0) -> None:
        self.base_url = base_url or os.getenv("OPEN_METEO_URL", "https://api.open-meteo.com/v1/forecast")
        self.timeout_seconds = timeout_seconds

    def forecast(self, latitude: float, longitude: float, hours: int = 72) -> WeatherForecast:
        forecast_days = max(1, min(7, (hours + 23) // 24 + 1))
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "hourly": "temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m",
            "timezone": "UTC",
            "forecast_days": forecast_days,
        }
        try:
            response = httpx.get(self.base_url, params=params, timeout=self.timeout_seconds)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise WeatherProviderError(f"Open-Meteo request failed: {exc}") from exc

        hourly = payload.get("hourly") or {}
        times = hourly.get("time") or []
        temperatures = hourly.get("temperature_2m") or []
        apparent = hourly.get("apparent_temperature") or []
        precipitation = hourly.get("precipitation_probability") or []
        wind = hourly.get("wind_speed_10m") or []

        if not times or len(times) != len(temperatures):
            raise WeatherProviderError("Open-Meteo returned incomplete hourly forecast")

        rows: list[WeatherHour] = []
        for index, raw_time in enumerate(times[:hours]):
            try:
                at = datetime.fromisoformat(raw_time)
                if at.tzinfo is None:
                    at = at.replace(tzinfo=timezone.utc)
                rows.append(
                    WeatherHour(
                        time=at,
                        temperature_c=float(temperatures[index]),
                        apparent_temperature_c=_optional_float(apparent, index),
                        precipitation_probability=_optional_int(precipitation, index),
                        wind_speed_kmh=_optional_float(wind, index),
                    )
                )
            except (TypeError, ValueError, IndexError) as exc:
                raise WeatherProviderError("Open-Meteo returned malformed hourly forecast") from exc

        return WeatherForecast(provider=self.name, latitude=latitude, longitude=longitude, hours=rows)


class DemoWeatherProvider(WeatherProvider):
    """Deterministic provider for CI and offline product demonstrations."""

    name = "demo"

    def forecast(self, latitude: float, longitude: float, hours: int = 72) -> WeatherForecast:
        base = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        rows: list[WeatherHour] = []
        for index in range(hours):
            hour = (base + timedelta(hours=index)).hour
            temperature = 5.0 - abs(4.0 - (hour % 12)) * 0.45
            if 10 <= index <= 13:
                temperature = -2.5 + abs(11.5 - index) * 0.4
            rows.append(
                WeatherHour(
                    time=base + timedelta(hours=index),
                    temperature_c=round(temperature, 1),
                    apparent_temperature_c=round(temperature - 1.0, 1),
                    precipitation_probability=20 if index % 7 else 55,
                    wind_speed_kmh=12.0 + (index % 5),
                )
            )
        return WeatherForecast(provider=self.name, latitude=latitude, longitude=longitude, hours=rows)


def get_weather_provider() -> WeatherProvider:
    provider = os.getenv("WEATHER_PROVIDER", "open_meteo").strip().lower()
    if provider in {"open_meteo", "open-meteo"}:
        return OpenMeteoWeatherProvider()
    if provider == "demo":
        return DemoWeatherProvider()
    raise WeatherProviderError(f"Unknown weather provider: {provider}")


def _optional_float(values: list, index: int) -> float | None:
    if index >= len(values) or values[index] is None:
        return None
    return float(values[index])


def _optional_int(values: list, index: int) -> int | None:
    if index >= len(values) or values[index] is None:
        return None
    return int(values[index])
