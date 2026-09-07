from datetime import datetime, timezone
from html import escape
from math import asin, cos, radians, sin, sqrt

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .analytics import track
from .database import get_db
from .models import (
    Alert,
    AlertRecipient,
    Apiary,
    Comment,
    CropSeason,
    Field,
    Neighbor,
    Post,
    ProductEvent,
    Reaction,
    User,
    VisitRequest,
)
from .schemas import (
    AlertCreate,
    AlertOpen,
    AlertOut,
    ApiaryCreate,
    ApiaryOut,
    CropSeasonCreate,
    CropSeasonOut,
    UserOut,
)

router = APIRouter()


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


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return radius * 2 * asin(sqrt(a))


def _can_view_field(db: Session, field: Field, viewer_id: int) -> bool:
    if viewer_id == field.owner_id or field.privacy_variant == "A":
        return True
    request = db.scalar(
        select(VisitRequest).where(
            VisitRequest.field_id == field.id,
            VisitRequest.requester_id == viewer_id,
            VisitRequest.status == "approved",
        )
    )
    return request is not None


def _alert_out(recipient: AlertRecipient) -> AlertOut:
    alert = recipient.alert
    field_name = alert.field.name if alert.field else None
    return AlertOut(
        id=alert.id,
        type=alert.type,
        title=str(alert.payload.get("title", "Предупреждение")),
        details=str(alert.payload.get("details", "")),
        field_id=alert.field_id,
        field_name=field_name,
        author=UserOut.model_validate(alert.author),
        latitude=alert.latitude,
        longitude=alert.longitude,
        radius_km=alert.radius_km,
        starts_at=alert.starts_at,
        distance_km=round(recipient.distance_km, 1),
        apiary_id=recipient.apiary_id,
        apiary_name=recipient.apiary.name if recipient.apiary else None,
        is_opened=recipient.opened_at is not None,
        created_at=alert.created_at,
    )


@router.get("/api/fields/{field_id}/crop-seasons", response_model=list[CropSeasonOut])
def crop_seasons(field_id: int, viewer_id: int, db: Session = Depends(get_db)) -> list[CropSeason]:
    _get_user(db, viewer_id)
    field = _get_field(db, field_id)
    if not _can_view_field(db, field, viewer_id):
        raise HTTPException(status_code=403, detail="Field details are private")
    rows = list(
        db.scalars(
            select(CropSeason)
            .where(CropSeason.field_id == field_id)
            .order_by(CropSeason.year.desc(), CropSeason.id.desc())
        ).all()
    )
    track(
        "crop_rotation_viewed",
        user_id=viewer_id,
        experiment_variant=field.privacy_variant,
        properties={"field_id": field.id, "seasons": len(rows)},
    )
    return rows


@router.post("/api/fields/{field_id}/crop-seasons", response_model=CropSeasonOut, status_code=status.HTTP_201_CREATED)
def add_crop_season(field_id: int, payload: CropSeasonCreate, db: Session = Depends(get_db)) -> CropSeason:
    field = _get_field(db, field_id)
    _get_user(db, payload.user_id)
    if field.owner_id != payload.user_id:
        raise HTTPException(status_code=403, detail="Only field owner can edit crop rotation")

    row = db.scalar(
        select(CropSeason).where(CropSeason.field_id == field_id, CropSeason.year == payload.year)
    )
    if row:
        row.crop = payload.crop.strip()
    else:
        row = CropSeason(field_id=field_id, year=payload.year, crop=payload.crop.strip())
        db.add(row)
    db.commit()
    db.refresh(row)
    track(
        "crop_rotation_added",
        user_id=payload.user_id,
        experiment_variant=field.privacy_variant,
        properties={"field_id": field.id, "year": row.year, "crop": row.crop},
    )
    return row


@router.get("/api/apiaries", response_model=list[ApiaryOut])
def apiaries(user_id: int, db: Session = Depends(get_db)) -> list[Apiary]:
    _get_user(db, user_id)
    return list(db.scalars(select(Apiary).where(Apiary.owner_id == user_id).order_by(Apiary.id)).all())


@router.post("/api/apiaries", response_model=ApiaryOut, status_code=status.HTTP_201_CREATED)
def create_apiary(payload: ApiaryCreate, db: Session = Depends(get_db)) -> Apiary:
    owner = _get_user(db, payload.owner_id)
    if not owner.is_beekeeper:
        raise HTTPException(status_code=409, detail="Enable 'У меня есть пасека' in profile first")
    apiary = Apiary(**payload.model_dump())
    db.add(apiary)
    db.commit()
    db.refresh(apiary)
    track(
        "apiary_created",
        user_id=owner.id,
        properties={"apiary_id": apiary.id, "alert_radius_km": apiary.alert_radius_km},
    )
    return apiary


@router.post("/api/alerts", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_alert(payload: AlertCreate, db: Session = Depends(get_db)) -> dict:
    author = _get_user(db, payload.author_id)
    field = None
    if payload.field_id is not None:
        field = _get_field(db, payload.field_id)
        if field.owner_id != author.id:
            raise HTTPException(status_code=403, detail="You can alert only from your own field")

    if payload.type == "pesticide" and field is None:
        raise HTTPException(status_code=422, detail="Pesticide alert must be linked to a field")

    alert = Alert(
        author_id=author.id,
        field_id=payload.field_id,
        type=payload.type,
        latitude=payload.latitude,
        longitude=payload.longitude,
        radius_km=payload.radius_km,
        starts_at=payload.starts_at,
        payload={"title": payload.title.strip(), "details": payload.details.strip()},
    )
    db.add(alert)
    db.flush()

    recipients = 0
    if payload.type == "pesticide":
        apiary_rows = list(db.scalars(select(Apiary).where(Apiary.owner_id != author.id)).all())
        for apiary in apiary_rows:
            distance = _distance_km(payload.latitude, payload.longitude, apiary.latitude, apiary.longitude)
            if distance <= payload.radius_km and distance <= apiary.alert_radius_km:
                db.add(
                    AlertRecipient(
                        alert_id=alert.id,
                        user_id=apiary.owner_id,
                        apiary_id=apiary.id,
                        distance_km=distance,
                    )
                )
                recipients += 1

    db.commit()
    track(
        "alert_created",
        user_id=author.id,
        properties={
            "alert_id": alert.id,
            "type": alert.type,
            "field_id": alert.field_id,
            "radius_km": alert.radius_km,
            "recipients": recipients,
        },
    )
    for recipient in db.scalars(select(AlertRecipient).where(AlertRecipient.alert_id == alert.id)).all():
        track(
            "alert_received",
            user_id=recipient.user_id,
            properties={
                "alert_id": alert.id,
                "type": alert.type,
                "apiary_id": recipient.apiary_id,
                "distance_km": round(recipient.distance_km, 1),
            },
        )
    return {"id": alert.id, "recipients": recipients}


@router.get("/api/alerts", response_model=list[AlertOut])
def received_alerts(user_id: int, db: Session = Depends(get_db)) -> list[AlertOut]:
    _get_user(db, user_id)
    rows = list(
        db.scalars(
            select(AlertRecipient)
            .where(AlertRecipient.user_id == user_id)
            .order_by(AlertRecipient.created_at.desc(), AlertRecipient.id.desc())
        ).all()
    )
    return [_alert_out(row) for row in rows]


@router.get("/api/alerts/unread-count")
def unread_alert_count(user_id: int, db: Session = Depends(get_db)) -> dict[str, int]:
    _get_user(db, user_id)
    count = db.scalar(
        select(func.count(AlertRecipient.id)).where(
            AlertRecipient.user_id == user_id,
            AlertRecipient.opened_at.is_(None),
        )
    ) or 0
    return {"count": count}


@router.put("/api/alerts/{alert_id}/open", response_model=AlertOut)
def open_alert(alert_id: int, payload: AlertOpen, db: Session = Depends(get_db)) -> AlertOut:
    _get_user(db, payload.user_id)
    recipient = db.scalar(
        select(AlertRecipient).where(
            AlertRecipient.alert_id == alert_id,
            AlertRecipient.user_id == payload.user_id,
        )
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Alert not found")
    if recipient.opened_at is None:
        recipient.opened_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(recipient)
        track(
            "alert_opened",
            user_id=payload.user_id,
            properties={"alert_id": alert_id, "type": recipient.alert.type},
        )
    return _alert_out(recipient)


@router.post("/api/alerts/{alert_id}/owner-contact", response_model=UserOut)
def alert_owner_contact(alert_id: int, user_id: int, db: Session = Depends(get_db)) -> User:
    _get_user(db, user_id)
    recipient = db.scalar(
        select(AlertRecipient).where(
            AlertRecipient.alert_id == alert_id,
            AlertRecipient.user_id == user_id,
        )
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Alert not found")
    track(
        "owner_contact_opened",
        user_id=user_id,
        properties={"alert_id": alert_id, "owner_id": recipient.alert.author_id},
    )
    return recipient.alert.author


def _metrics_data(db: Session) -> dict:
    users = list(db.scalars(select(User)).all())
    events = db.execute(
        select(ProductEvent.event_name, func.count(ProductEvent.id)).group_by(ProductEvent.event_name)
    ).all()
    return {
        "users": len(users),
        "fields": db.scalar(select(func.count(Field.id))) or 0,
        "crop_seasons": db.scalar(select(func.count(CropSeason.id))) or 0,
        "posts": db.scalar(select(func.count(Post.id))) or 0,
        "reactions": db.scalar(select(func.count(Reaction.id))) or 0,
        "comments": db.scalar(select(func.count(Comment.id))) or 0,
        "neighbors": db.scalar(select(func.count(Neighbor.id))) or 0,
        "apiaries": db.scalar(select(func.count(Apiary.id))) or 0,
        "alerts": db.scalar(select(func.count(Alert.id))) or 0,
        "alert_deliveries": db.scalar(select(func.count(AlertRecipient.id))) or 0,
        "alert_opens": db.scalar(select(func.count(AlertRecipient.id)).where(AlertRecipient.opened_at.is_not(None))) or 0,
        "events": {name: count for name, count in events},
    }


@router.get("/internal/metrics", response_class=HTMLResponse, include_in_schema=False)
def metrics_html(db: Session = Depends(get_db)) -> HTMLResponse:
    metrics = _metrics_data(db)
    event_rows = "".join(
        f"<tr><td><code>{escape(str(name))}</code></td><td>{count}</td></tr>"
        for name, count in sorted(metrics["events"].items(), key=lambda item: (-item[1], item[0]))
    )
    cards = "".join(
        f"<div class='card'><strong>{value}</strong><span>{escape(label)}</span></div>"
        for label, value in [
            ("Пользователи", metrics["users"]),
            ("Поля", metrics["fields"]),
            ("Сезоны севооборота", metrics["crop_seasons"]),
            ("Публикации", metrics["posts"]),
            ("Реакции", metrics["reactions"]),
            ("Комментарии", metrics["comments"]),
            ("Соседи", metrics["neighbors"]),
            ("Пасеки", metrics["apiaries"]),
            ("Предупреждения", metrics["alerts"]),
            ("Доставлено", metrics["alert_deliveries"]),
            ("Открыто", metrics["alert_opens"]),
        ]
    )
    html = f"""
    <!doctype html>
    <html lang='ru'>
    <head>
      <meta charset='utf-8'>
      <meta name='viewport' content='width=device-width,initial-scale=1'>
      <title>AgroConnect — метрики MVP</title>
      <style>
        body {{ font-family: system-ui, sans-serif; margin: 0; background: #f5f7f4; color: #1f2a22; }}
        main {{ max-width: 980px; margin: 0 auto; padding: 28px 18px 60px; }}
        h1 {{ margin-bottom: 6px; }} .muted {{ color: #667166; margin-top: 0; }}
        .grid {{ display: grid; grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); gap: 12px; margin: 22px 0; }}
        .card {{ background: white; border: 1px solid #dfe7df; border-radius: 14px; padding: 16px; display: grid; gap: 5px; }}
        .card strong {{ font-size: 28px; }} .card span {{ color: #667166; }}
        table {{ width: 100%; border-collapse: collapse; background: white; border-radius: 14px; overflow: hidden; }}
        th,td {{ text-align: left; padding: 10px 12px; border-bottom: 1px solid #edf0ed; }}
        th {{ background: #eef4ee; }}
      </style>
    </head>
    <body><main>
      <h1>AgroConnect — метрики MVP</h1>
      <p class='muted'>Внутренний браузерный экран. В мобильное приложение не встроен.</p>
      <div class='grid'>{cards}</div>
      <h2>Продуктовые события</h2>
      <table><thead><tr><th>Событие</th><th>Количество</th></tr></thead><tbody>{event_rows}</tbody></table>
    </main></body></html>
    """
    return HTMLResponse(html)
