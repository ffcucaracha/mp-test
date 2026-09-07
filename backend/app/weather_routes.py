from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import select
from sqlalchemy.orm import Session

from .analytics import track
from .database import get_db
from .models import Alert, AlertRecipient, Field, User
from .weather import WeatherProviderError, get_weather_provider

router = APIRouter()


class WeatherCheck(BaseModel):
    user_id: int
    frost_threshold_c: float = PydanticField(default=0.0, ge=-15.0, le=10.0)
    hours: int = PydanticField(default=72, ge=12, le=120)


class WeatherHourOut(BaseModel):
    time: datetime
    temperature_c: float
    apparent_temperature_c: float | None
    precipitation_probability: int | None
    wind_speed_kmh: float | None


class FieldWeatherOut(BaseModel):
    field_id: int
    field_name: str
    provider: str
    checked_at: datetime
    threshold_c: float
    hours_requested: int
    frost_risk: bool
    frost_starts_at: datetime | None
    min_temperature_c: float
    max_precipitation_probability: int | None
    max_wind_speed_kmh: float | None
    alert_id: int | None
    alert_created: bool
    hours: list[WeatherHourOut]


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _get_field(db: Session, field_id: int) -> Field:
    field = db.get(Field, field_id)
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    return field


@router.post("/api/fields/{field_id}/weather/check", response_model=FieldWeatherOut)
def check_field_weather(field_id: int, payload: WeatherCheck, db: Session = Depends(get_db)) -> FieldWeatherOut:
    user = _get_user(db, payload.user_id)
    field = _get_field(db, field_id)
    if field.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Weather forecast is available to the field owner")

    try:
        provider = get_weather_provider()
        forecast = provider.forecast(field.latitude, field.longitude, payload.hours)
    except WeatherProviderError as exc:
        track(
            "weather_provider_failed",
            user_id=user.id,
            properties={"field_id": field.id, "provider": "configured", "error": str(exc)[:160]},
        )
        raise HTTPException(status_code=502, detail=f"Weather provider unavailable: {exc}") from exc

    if not forecast.hours:
        raise HTTPException(status_code=502, detail="Weather provider returned an empty forecast")

    min_temperature = min(row.temperature_c for row in forecast.hours)
    precipitation_values = [row.precipitation_probability for row in forecast.hours if row.precipitation_probability is not None]
    wind_values = [row.wind_speed_kmh for row in forecast.hours if row.wind_speed_kmh is not None]
    frost_hours = [row for row in forecast.hours if row.temperature_c <= payload.frost_threshold_c]
    frost_starts_at = frost_hours[0].time if frost_hours else None

    track(
        "weather_forecast_checked",
        user_id=user.id,
        experiment_variant=field.privacy_variant,
        properties={
            "field_id": field.id,
            "provider": forecast.provider,
            "hours": payload.hours,
            "threshold_c": payload.frost_threshold_c,
            "min_temperature_c": round(min_temperature, 1),
            "frost_risk": bool(frost_hours),
        },
    )

    alert_id: int | None = None
    alert_created = False
    if frost_starts_at is not None:
        track(
            "frost_risk_detected",
            user_id=user.id,
            experiment_variant=field.privacy_variant,
            properties={
                "field_id": field.id,
                "provider": forecast.provider,
                "starts_at": frost_starts_at.isoformat(),
                "min_temperature_c": round(min_temperature, 1),
            },
        )

        existing = db.scalar(
            select(Alert)
            .where(
                Alert.type == "weather",
                Alert.field_id == field.id,
                Alert.starts_at == frost_starts_at,
            )
            .order_by(Alert.id.desc())
        )
        if existing:
            alert = existing
        else:
            details = (
                f"На поле «{field.name}» прогнозируется температура до {min_temperature:.1f} °C. "
                f"Первый риск при пороге {payload.frost_threshold_c:.1f} °C: {frost_starts_at.strftime('%d.%m %H:%M')} UTC."
            )
            alert = Alert(
                author_id=user.id,
                field_id=field.id,
                type="weather",
                latitude=field.latitude,
                longitude=field.longitude,
                radius_km=1,
                starts_at=frost_starts_at,
                payload={
                    "kind": "frost",
                    "title": "Риск заморозков",
                    "details": details,
                    "provider": forecast.provider,
                    "threshold_c": payload.frost_threshold_c,
                    "min_temperature_c": round(min_temperature, 1),
                },
            )
            db.add(alert)
            db.flush()
            alert_created = True

        recipient = db.scalar(
            select(AlertRecipient).where(
                AlertRecipient.alert_id == alert.id,
                AlertRecipient.user_id == user.id,
            )
        )
        if not recipient:
            db.add(
                AlertRecipient(
                    alert_id=alert.id,
                    user_id=user.id,
                    apiary_id=None,
                    distance_km=0.0,
                )
            )
        db.commit()
        alert_id = alert.id

        if alert_created:
            track(
                "weather_alert_created",
                user_id=user.id,
                experiment_variant=field.privacy_variant,
                properties={"alert_id": alert.id, "field_id": field.id, "provider": forecast.provider},
            )
            track(
                "alert_received",
                user_id=user.id,
                properties={"alert_id": alert.id, "type": "weather", "field_id": field.id},
            )
        else:
            track(
                "weather_alert_deduplicated",
                user_id=user.id,
                experiment_variant=field.privacy_variant,
                properties={"alert_id": alert.id, "field_id": field.id},
            )

    return FieldWeatherOut(
        field_id=field.id,
        field_name=field.name,
        provider=forecast.provider,
        checked_at=datetime.now(timezone.utc),
        threshold_c=payload.frost_threshold_c,
        hours_requested=payload.hours,
        frost_risk=bool(frost_hours),
        frost_starts_at=frost_starts_at,
        min_temperature_c=round(min_temperature, 1),
        max_precipitation_probability=max(precipitation_values) if precipitation_values else None,
        max_wind_speed_kmh=round(max(wind_values), 1) if wind_values else None,
        alert_id=alert_id,
        alert_created=alert_created,
        hours=[
            WeatherHourOut(
                time=row.time,
                temperature_c=row.temperature_c,
                apparent_temperature_c=row.apparent_temperature_c,
                precipitation_probability=row.precipitation_probability,
                wind_speed_kmh=row.wind_speed_kmh,
            )
            for row in forecast.hours[:24]
        ],
    )
