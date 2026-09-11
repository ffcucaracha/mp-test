from __future__ import annotations

from collections import Counter
from html import escape
from statistics import mean

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .analytics import track
from .database import get_db
from .models import Field, User, UserFeedback
from .schemas import FeedbackCreate, FeedbackOut

router = APIRouter()

DIARY_LABELS = {
    "yes": "Да",
    "probably_yes": "Скорее да",
    "probably_no": "Скорее нет",
    "no": "Нет",
}

FEATURE_LABELS = {
    "local_events": "События рядом",
    "field_history": "История полей",
    "alerts": "Предупреждения",
    "neighbors": "Общение с соседями",
    "plant_analysis": "Анализ растений",
}

FEATURE_COLORS = {
    "local_events": "#315f2b",
    "field_history": "#73956a",
    "alerts": "#d99d2b",
    "neighbors": "#6a87a8",
    "plant_analysis": "#9a6b8f",
}


def _user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _privacy_variant(db: Session, user_id: int) -> str | None:
    field = db.scalar(select(Field).where(Field.owner_id == user_id).order_by(Field.id).limit(1))
    return field.privacy_variant if field else None


def _latest_feedback(db: Session, user_id: int) -> UserFeedback | None:
    return db.scalar(
        select(UserFeedback)
        .where(UserFeedback.user_id == user_id)
        .order_by(UserFeedback.created_at.desc(), UserFeedback.id.desc())
        .limit(1)
    )


@router.get("/api/users/{user_id}/feedback/latest", response_model=FeedbackOut | None)
def latest_feedback(user_id: int, db: Session = Depends(get_db)) -> UserFeedback | None:
    _user_or_404(db, user_id)
    return _latest_feedback(db, user_id)


@router.get("/api/users/{user_id}/feedback/history", response_model=list[FeedbackOut])
def feedback_history(user_id: int, db: Session = Depends(get_db)) -> list[UserFeedback]:
    _user_or_404(db, user_id)
    return list(
        db.scalars(
            select(UserFeedback)
            .where(UserFeedback.user_id == user_id)
            .order_by(UserFeedback.created_at.desc(), UserFeedback.id.desc())
        ).all()
    )


@router.post("/api/users/{user_id}/feedback/opened")
def feedback_opened(user_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    _user_or_404(db, user_id)
    track("feedback_opened", user_id=user_id, experiment_variant=_privacy_variant(db, user_id))
    return {"ok": True}


@router.post(
    "/api/users/{user_id}/feedback",
    response_model=FeedbackOut,
    status_code=status.HTTP_201_CREATED,
)
def submit_feedback(user_id: int, payload: FeedbackCreate, db: Session = Depends(get_db)) -> UserFeedback:
    _user_or_404(db, user_id)
    previous = _latest_feedback(db, user_id)
    privacy_variant = _privacy_variant(db, user_id)
    item = UserFeedback(
        user_id=user_id,
        privacy_variant=privacy_variant,
        **payload.model_dump(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    event_name = "feedback_resubmitted" if previous else "feedback_submitted"
    track(
        event_name,
        user_id=user_id,
        experiment_variant=privacy_variant,
        properties={
            "rating": item.rating,
            "local_network_score": item.local_network_score,
            "field_diary_intent": item.field_diary_intent,
            "alerts_score": item.alerts_score,
            "privacy_comfort_score": item.privacy_comfort_score,
            "most_valuable_feature": item.most_valuable_feature,
            "app_version": item.app_version,
        },
    )
    return item


def _latest_per_user(db: Session) -> list[UserFeedback]:
    rows = list(
        db.scalars(
            select(UserFeedback).order_by(
                UserFeedback.user_id,
                UserFeedback.created_at.desc(),
                UserFeedback.id.desc(),
            )
        ).all()
    )
    latest: list[UserFeedback] = []
    seen: set[int] = set()
    for row in rows:
        if row.user_id in seen:
            continue
        seen.add(row.user_id)
        latest.append(row)
    return latest


def _avg(rows: list[UserFeedback], attr: str) -> float:
    values = [getattr(row, attr) for row in rows]
    return round(mean(values), 2) if values else 0.0


def _pct(value: int, total: int) -> float:
    return round(value / total * 100, 1) if total else 0.0


def feedback_summary(db: Session) -> dict:
    latest = _latest_per_user(db)
    all_rows = list(
        db.scalars(
            select(UserFeedback).order_by(UserFeedback.created_at.desc(), UserFeedback.id.desc())
        ).all()
    )
    total_users = db.scalar(select(func.count(User.id))) or 0
    rating_distribution = Counter(row.rating for row in latest)
    diary_distribution = Counter(row.field_diary_intent for row in latest)
    feature_distribution = Counter(row.most_valuable_feature for row in latest)

    return {
        "unique_users": len(latest),
        "total_users": int(total_users),
        "response_rate_percent": _pct(len(latest), int(total_users)),
        "total_submissions": len(all_rows),
        "repeat_submissions": max(0, len(all_rows) - len(latest)),
        "average_rating": _avg(latest, "rating"),
        "rating_distribution": {str(score): rating_distribution.get(score, 0) for score in range(1, 6)},
        "hypotheses": {
            "local_network": _avg(latest, "local_network_score"),
            "alerts": _avg(latest, "alerts_score"),
            "privacy": _avg(latest, "privacy_comfort_score"),
        },
        "diary_distribution": {key: diary_distribution.get(key, 0) for key in DIARY_LABELS},
        "feature_distribution": {key: feature_distribution.get(key, 0) for key in FEATURE_LABELS},
        "latest": latest,
        "history": all_rows,
    }


@router.get("/api/internal/feedback", include_in_schema=False)
def feedback_summary_json(db: Session = Depends(get_db)) -> dict:
    summary = feedback_summary(db)
    return {
        key: value
        for key, value in summary.items()
        if key not in {"latest", "history"}
    }


def _bar_rows(distribution: dict[str, int], labels: dict[str, str] | None = None) -> str:
    total = sum(distribution.values())
    rows = []
    for key, count in distribution.items():
        label = labels.get(key, key) if labels else key
        width = _pct(count, total)
        rows.append(
            "<div class='bar-row'>"
            f"<span>{escape(str(label))}</span>"
            "<div class='bar-track'>"
            f"<i style='width:{width}%'></i>"
            "</div>"
            f"<strong>{count}</strong>"
            "</div>"
        )
    return "".join(rows)


def _pie_style(distribution: dict[str, int]) -> str:
    total = sum(distribution.values())
    if not total:
        return "background:#e9eee8"
    stops: list[str] = []
    start = 0.0
    for key in FEATURE_LABELS:
        count = distribution.get(key, 0)
        if count <= 0:
            continue
        end = start + count / total * 360
        color = FEATURE_COLORS[key]
        stops.append(f"{color} {start:.1f}deg {end:.1f}deg")
        start = end
    return f"background:conic-gradient({','.join(stops)})"


@router.get("/internal/feedback", response_class=HTMLResponse, include_in_schema=False)
def feedback_dashboard(db: Session = Depends(get_db)) -> HTMLResponse:
    summary = feedback_summary(db)
    latest: list[UserFeedback] = summary["latest"]
    history: list[UserFeedback] = summary["history"]

    rating_rows = _bar_rows(summary["rating_distribution"])
    diary_rows = _bar_rows(summary["diary_distribution"], DIARY_LABELS)
    feature_rows = _bar_rows(summary["feature_distribution"], FEATURE_LABELS)

    latest_comments = "".join(
        "<tr>"
        f"<td>{escape(row.user.name)}</td>"
        f"<td>{'🌻' * row.rating}</td>"
        f"<td>{escape(row.liked_text or '—')}</td>"
        f"<td>{escape(row.improvement_text or '—')}</td>"
        "</tr>"
        for row in latest
    ) or "<tr><td colspan='4'>Пока нет обратной связи</td></tr>"

    history_rows = "".join(
        "<tr>"
        f"<td>{escape(row.created_at.strftime('%d.%m.%Y %H:%M'))}</td>"
        f"<td>{escape(row.user.name)}</td>"
        f"<td>{row.rating}</td>"
        f"<td>{escape(row.app_version)}</td>"
        f"<td>{escape(row.privacy_variant or '—')}</td>"
        "</tr>"
        for row in history
    ) or "<tr><td colspan='5'>История пуста</td></tr>"

    feature_legend = "".join(
        "<div class='legend-item'>"
        f"<i style='background:{FEATURE_COLORS[key]}'></i>"
        f"<span>{escape(label)}</span>"
        "</div>"
        for key, label in FEATURE_LABELS.items()
    )

    html = f"""<!doctype html>
<html lang='ru'>
<head>
<meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>
<title>AgroConnect — обратная связь</title>
<style>
body{{font-family:system-ui,sans-serif;margin:0;background:#f5f7f4;color:#1f2a22}}main{{max-width:1120px;margin:auto;padding:28px 18px 60px}}
h1{{margin-bottom:4px}}h2{{margin-top:30px}}.muted{{color:#667166}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}}
.card{{background:#fff;border:1px solid #dfe7df;border-radius:14px;padding:16px;display:grid;gap:5px}}.card strong{{font-size:28px}}.card span{{color:#667166}}
.cols{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}}.panel{{background:#fff;border:1px solid #dfe7df;border-radius:14px;padding:16px}}
.bar-row{{display:grid;grid-template-columns:120px 1fr 32px;gap:10px;align-items:center;margin:10px 0}}.bar-track{{height:12px;border-radius:999px;background:#e9eee8;overflow:hidden}}.bar-track i{{display:block;height:100%;background:#315f2b;border-radius:999px}}
.pie-wrap{{display:flex;gap:22px;align-items:center;flex-wrap:wrap}}.pie{{width:170px;height:170px;border-radius:50%;position:relative}}.pie:after{{content:'';position:absolute;inset:42px;border-radius:50%;background:#fff}}
.legend{{display:grid;gap:8px}}.legend-item{{display:flex;align-items:center;gap:8px}}.legend-item i{{width:12px;height:12px;border-radius:3px}}
table{{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden}}th,td{{text-align:left;padding:10px 12px;border-bottom:1px solid #edf0ed;vertical-align:top}}th{{background:#eef4ee}}.scroll{{overflow:auto}}
.note{{background:#fff7df;border:1px solid #eadca9;border-radius:12px;padding:12px 14px;margin:14px 0}}
</style></head><body><main>
<h1>AgroConnect — обратная связь</h1>
<p class='muted'>В графиках и средних учитывается только последняя отправка каждого пользователя. Полная история хранится отдельно.</p>
<div class='grid'>
<div class='card'><strong>{summary['average_rating']} / 5</strong><span>Средняя оценка</span></div>
<div class='card'><strong>{summary['unique_users']}</strong><span>Уникальных респондентов</span></div>
<div class='card'><strong>{summary['response_rate_percent']}%</strong><span>Охват пользователей</span></div>
<div class='card'><strong>{summary['total_submissions']}</strong><span>Всего отправок</span></div>
<div class='card'><strong>{summary['repeat_submissions']}</strong><span>Повторных отзывов</span></div>
</div>

<h2>Распределение общей оценки</h2><div class='panel'>{rating_rows}</div>

<h2>Проверка гипотез</h2>
<div class='grid'>
<div class='card'><strong>{summary['hypotheses']['local_network']} / 5</strong><span>Полезность локальной сети</span></div>
<div class='card'><strong>{summary['hypotheses']['alerts']} / 5</strong><span>Полезность предупреждений</span></div>
<div class='card'><strong>{summary['hypotheses']['privacy']} / 5</strong><span>Комфорт делиться данными полей</span></div>
</div>
<div class='cols' style='margin-top:16px'>
<div class='panel'><h3>Готовность вести историю полей</h3>{diary_rows}</div>
<div class='panel'><h3>Самая ценная функция</h3><div class='pie-wrap'><div class='pie' style='{_pie_style(summary['feature_distribution'])}'></div><div class='legend'>{feature_legend}</div></div>{feature_rows}</div>
</div>

<h2>Последние комментарии пользователей</h2>
<div class='scroll'><table><thead><tr><th>Пользователь</th><th>Оценка</th><th>Что понравилось</th><th>Что улучшить</th></tr></thead><tbody>{latest_comments}</tbody></table></div>

<h2>История всех отправок</h2>
<p class='muted'>Эта таблица не влияет на графики: повторные ответы одного человека сохранены для анализа динамики.</p>
<div class='scroll'><table><thead><tr><th>Дата</th><th>Пользователь</th><th>Оценка</th><th>Версия</th><th>Privacy</th></tr></thead><tbody>{history_rows}</tbody></table></div>
</main></body></html>"""
    return HTMLResponse(html)
