from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from html import escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .analytics import track
from .database import get_db
from .models import Alert, AlertRecipient, CropSeason, Field, Neighbor, Post, ProductEvent, Reaction, User, VisitRequest

router = APIRouter()

MEANINGFUL_ACTIVITY_EVENTS = {
    "profile_updated",
    "profile_completed",
    "field_created",
    "field_location_added",
    "field_privacy_changed",
    "visit_request_sent",
    "visit_request_approved",
    "visit_request_rejected",
    "post_created",
    "reaction_added",
    "reaction_changed",
    "comment_created",
    "neighbor_added",
    "crop_rotation_added",
    "apiary_created",
    "alert_created",
    "weather_alert_created",
}


class GamificationMetrics(BaseModel):
    profile_completeness: int
    neighbors: int
    weekly_activity_streak: int
    reputation: int


def _profile_completeness(user: User) -> int:
    values = [user.name, user.region, user.specialization, user.farm_name, user.bio]
    completed = sum(1 for value in values if value and value.strip())
    return round(completed / len(values) * 100)


def _week_key(value: datetime) -> tuple[int, int]:
    iso = value.isocalendar()
    return iso.year, iso.week


def _previous_week(year: int, week: int) -> tuple[int, int]:
    previous = date.fromisocalendar(year, week, 1) - timedelta(days=7)
    iso = previous.isocalendar()
    return iso.year, iso.week


def _weekly_activity_streak(db: Session, user_id: int) -> int:
    rows = db.scalars(
        select(ProductEvent.created_at).where(
            ProductEvent.user_id == user_id,
            ProductEvent.event_name.in_(MEANINGFUL_ACTIVITY_EVENTS),
        )
    ).all()
    weeks = {_week_key(created_at) for created_at in rows}
    current = _week_key(datetime.now(timezone.utc))
    streak = 0
    while current in weeks:
        streak += 1
        current = _previous_week(*current)
    return streak


def gamification_data(db: Session, user_id: int) -> GamificationMetrics:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    neighbors = db.scalar(select(func.count(Neighbor.id)).where(Neighbor.user_id == user_id)) or 0
    reputation = db.scalar(
        select(func.coalesce(func.sum(Reaction.value), 0))
        .select_from(Reaction)
        .join(Post, Reaction.post_id == Post.id)
        .where(Post.author_id == user_id)
    ) or 0
    streak = _weekly_activity_streak(db, user_id)

    result = GamificationMetrics(
        profile_completeness=_profile_completeness(user),
        neighbors=int(neighbors),
        weekly_activity_streak=streak,
        reputation=int(reputation),
    )
    track("streak_viewed", user_id=user_id, properties={"weeks": streak})
    track("reputation_viewed", user_id=user_id, properties={"reputation": int(reputation)})
    return result


@router.get("/api/users/{user_id}/gamification", response_model=GamificationMetrics)
def gamification(user_id: int, db: Session = Depends(get_db)) -> GamificationMetrics:
    return gamification_data(db, user_id)


def _pct(value: int, total: int) -> float:
    return round(value / total * 100, 1) if total else 0.0


def _event_counts(db: Session) -> dict[str, int]:
    rows = db.execute(
        select(ProductEvent.event_name, func.count(ProductEvent.id)).group_by(ProductEvent.event_name)
    ).all()
    return {name: count for name, count in rows}


def _variant_metrics(db: Session, variant: str, all_fields: int) -> dict:
    fields = list(db.scalars(select(Field).where(Field.privacy_variant == variant)).all())
    field_ids = [field.id for field in fields]
    field_count = len(fields)
    with_location = sum(1 for field in fields if field.latitude is not None and field.longitude is not None)
    rotations = 0
    if field_ids:
        rotations = db.scalar(
            select(func.count(func.distinct(CropSeason.field_id))).where(CropSeason.field_id.in_(field_ids))
        ) or 0

    visit_requests = db.scalar(
        select(func.count(VisitRequest.id)).join(Field).where(Field.privacy_variant == variant)
    ) or 0
    approvals = db.scalar(
        select(func.count(VisitRequest.id))
        .join(Field)
        .where(Field.privacy_variant == variant, VisitRequest.status == "approved")
    ) or 0

    event_rows = db.execute(
        select(ProductEvent.event_name, func.count(ProductEvent.id))
        .where(ProductEvent.experiment_variant == variant)
        .group_by(ProductEvent.event_name)
    ).all()
    events = {name: count for name, count in event_rows}

    return {
        "fields": field_count,
        "field_creation_rate": _pct(field_count, all_fields),
        "location_completion_rate": _pct(with_location, field_count),
        "crop_rotation_completion_rate": _pct(int(rotations), field_count),
        "visit_requests": int(visit_requests),
        "approvals": int(approvals),
        "approval_rate": _pct(int(approvals), int(visit_requests)),
        "detailed_field_views": int(events.get("public_field_viewed", 0)),
        "hidden_field_views": int(events.get("private_field_viewed", 0)),
    }


def internal_metrics_data(db: Session) -> dict:
    users = list(db.scalars(select(User)).all())
    events = _event_counts(db)
    fields = db.scalar(select(func.count(Field.id))) or 0
    fields_with_location = db.scalar(
        select(func.count(Field.id)).where(Field.latitude.is_not(None), Field.longitude.is_not(None))
    ) or 0
    completed_profiles = sum(1 for user in users if _profile_completeness(user) == 100)

    alert_count = db.scalar(select(func.count(Alert.id))) or 0
    deliveries = db.scalar(select(func.count(AlertRecipient.id))) or 0
    opens = db.scalar(
        select(func.count(AlertRecipient.id)).where(AlertRecipient.opened_at.is_not(None))
    ) or 0

    recent = list(
        db.scalars(
            select(ProductEvent).order_by(ProductEvent.created_at.desc(), ProductEvent.id.desc()).limit(40)
        ).all()
    )

    return {
        "activation": {
            "users": len(users),
            "profiles_completed": completed_profiles,
            "profile_completion_rate": _pct(completed_profiles, len(users)),
            "fields": int(fields),
            "fields_with_location": int(fields_with_location),
            "field_location_completion_rate": _pct(int(fields_with_location), int(fields)),
        },
        "social": {
            "posts": db.scalar(select(func.count(Post.id))) or 0,
            "post_views": events.get("post_viewed", 0),
            "feed_opens": events.get("feed_opened", 0),
            "reactions": db.scalar(select(func.count(Reaction.id))) or 0,
            "comments": events.get("comment_created", 0),
            "neighbors": db.scalar(select(func.count(Neighbor.id))) or 0,
        },
        "alerts": {
            "created": int(alert_count),
            "received": int(deliveries),
            "opened": int(opens),
            "open_rate": _pct(int(opens), int(deliveries)),
            "pesticide": db.scalar(select(func.count(Alert.id)).where(Alert.type == "pesticide")) or 0,
            "weather": db.scalar(select(func.count(Alert.id)).where(Alert.type == "weather")) or 0,
            "owner_contact_opens": events.get("owner_contact_opened", 0),
        },
        "privacy": {
            "A": _variant_metrics(db, "A", int(fields)),
            "B": _variant_metrics(db, "B", int(fields)),
        },
        "ml": {
            "starts": events.get("ml_started", 0),
            "shown": events.get("ml_result_shown", 0),
            "accepted": events.get("ml_result_accepted", 0),
            "rejected": events.get("ml_result_rejected", 0),
        },
        "events": events,
        "recent_events": recent,
    }


def _cards(items: list[tuple[str, object]]) -> str:
    return "".join(
        f"<div class='card'><strong>{escape(str(value))}</strong><span>{escape(label)}</span></div>"
        for label, value in items
    )


def _privacy_row(label: str, a: object, b: object) -> str:
    return f"<tr><td>{escape(label)}</td><td>{escape(str(a))}</td><td>{escape(str(b))}</td></tr>"


@router.get("/internal/metrics", response_class=HTMLResponse, include_in_schema=False)
def metrics_html(db: Session = Depends(get_db)) -> HTMLResponse:
    metrics = internal_metrics_data(db)
    activation = metrics["activation"]
    social = metrics["social"]
    alerts = metrics["alerts"]
    privacy_a = metrics["privacy"]["A"]
    privacy_b = metrics["privacy"]["B"]

    event_rows = "".join(
        f"<tr><td><code>{escape(name)}</code></td><td>{count}</td></tr>"
        for name, count in sorted(metrics["events"].items(), key=lambda item: (-item[1], item[0]))
    )
    recent_rows = "".join(
        f"<tr><td>{escape(event.created_at.astimezone(timezone.utc).strftime('%d.%m %H:%M'))}</td>"
        f"<td><code>{escape(event.event_name)}</code></td><td>{event.user_id or '—'}</td>"
        f"<td>{escape(event.experiment_variant or '—')}</td></tr>"
        for event in metrics["recent_events"]
    )
    privacy_rows = "".join([
        _privacy_row("Поля", privacy_a["fields"], privacy_b["fields"]),
        _privacy_row("Доля созданных полей", f'{privacy_a["field_creation_rate"]}%', f'{privacy_b["field_creation_rate"]}%'),
        _privacy_row("География заполнена", f'{privacy_a["location_completion_rate"]}%', f'{privacy_b["location_completion_rate"]}%'),
        _privacy_row("Есть севооборот", f'{privacy_a["crop_rotation_completion_rate"]}%', f'{privacy_b["crop_rotation_completion_rate"]}%'),
        _privacy_row("Запросы в гости", privacy_a["visit_requests"], privacy_b["visit_requests"]),
        _privacy_row("Одобрено запросов", privacy_a["approvals"], privacy_b["approvals"]),
        _privacy_row("Approval rate", f'{privacy_a["approval_rate"]}%', f'{privacy_b["approval_rate"]}%'),
        _privacy_row("Просмотры деталей", privacy_a["detailed_field_views"], privacy_b["detailed_field_views"]),
        _privacy_row("Скрытые просмотры", privacy_a["hidden_field_views"], privacy_b["hidden_field_views"]),
    ])

    html = f"""<!doctype html>
<html lang='ru'>
<head>
<meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>
<title>AgroConnect — метрики MVP</title>
<style>
body{{font-family:system-ui,sans-serif;margin:0;background:#f5f7f4;color:#1f2a22}}main{{max-width:1100px;margin:auto;padding:28px 18px 60px}}
h1{{margin-bottom:4px}}h2{{margin-top:30px}}.muted{{color:#667166}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px}}
.card{{background:#fff;border:1px solid #dfe7df;border-radius:14px;padding:16px;display:grid;gap:5px}}.card strong{{font-size:26px}}.card span{{color:#667166}}
table{{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden}}th,td{{text-align:left;padding:10px 12px;border-bottom:1px solid #edf0ed}}th{{background:#eef4ee}}
.note{{background:#fff7df;border:1px solid #eadca9;border-radius:12px;padding:12px 14px;margin:14px 0}}code{{font-size:.92em}}
</style></head><body><main>
<h1>AgroConnect — метрики MVP</h1><p class='muted'>Внутренний браузерный экран. В мобильное приложение не встроен.</p>
<h2>Активация</h2>{_cards([('Пользователи',activation['users']),('Профили заполнены',activation['profiles_completed']),('Полнота профилей',f"{activation['profile_completion_rate']}%"),('Поля',activation['fields']),('Поля с географией',activation['fields_with_location']),('География заполнена',f"{activation['field_location_completion_rate']}%")])}
<h2>Социальное ядро</h2>{_cards([('Публикации',social['posts']),('Просмотры постов',social['post_views']),('Открытия ленты',social['feed_opens']),('Реакции',social['reactions']),('Комментарии',social['comments']),('Соседи',social['neighbors'])])}
<h2>Предупреждения</h2>{_cards([('Создано',alerts['created']),('Получено',alerts['received']),('Открыто',alerts['opened']),('Open rate',f"{alerts['open_rate']}%"),('Пестициды',alerts['pesticide']),('Погода',alerts['weather']),('Открыт контакт владельца',alerts['owner_contact_opens'])])}
<h2>Приватность A/B</h2><div class='note'>В текущем MVP вариант приватности привязан к полю, а не к пользователю. Поэтому «доля созданных полей» считается среди всех полей.</div>
<table><thead><tr><th>Метрика</th><th>Вариант A</th><th>Вариант B</th></tr></thead><tbody>{privacy_rows}</tbody></table>
<h2>ML-воронка</h2>{_cards([('Запуски',metrics['ml']['starts']),('Результат показан',metrics['ml']['shown']),('Принято',metrics['ml']['accepted']),('Отклонено',metrics['ml']['rejected'])])}
<h2>Продуктовые события</h2><table><thead><tr><th>Событие</th><th>Количество</th></tr></thead><tbody>{event_rows}</tbody></table>
<h2>Последние события</h2><table><thead><tr><th>UTC</th><th>Событие</th><th>User</th><th>A/B</th></tr></thead><tbody>{recent_rows}</tbody></table>
</main></body></html>"""
    return HTMLResponse(html)
