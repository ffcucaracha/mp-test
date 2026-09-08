from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .analytics import track
from .database import get_db
from .models import ProductEvent, User

router = APIRouter(prefix="/api/experiments/monetization", tags=["monetization"])

MonetizationEventName = Literal[
    "premium_teaser_shown",
    "premium_teaser_clicked",
    "ad_impression",
    "ad_closed",
    "ad_free_offer_shown",
    "ad_free_offer_accepted",
    "ad_free_offer_declined",
]

EVENT_NAMES: tuple[str, ...] = (
    "premium_teaser_shown",
    "premium_teaser_clicked",
    "ad_impression",
    "ad_closed",
    "ad_free_offer_shown",
    "ad_free_offer_accepted",
    "ad_free_offer_declined",
)


class MonetizationEventIn(BaseModel):
    user_id: int
    event_name: MonetizationEventName
    properties: dict[str, Any] = PydanticField(default_factory=dict)


class MonetizationEventOut(BaseModel):
    ok: bool
    event_name: MonetizationEventName


def _pct(value: int, total: int) -> float:
    return round(value / total * 100, 1) if total else 0.0


@router.post("/events", response_model=MonetizationEventOut)
def record_monetization_event(
    payload: MonetizationEventIn,
    db: Session = Depends(get_db),
) -> MonetizationEventOut:
    if not db.get(User, payload.user_id):
        raise HTTPException(status_code=404, detail="User not found")

    track(
        payload.event_name,
        user_id=payload.user_id,
        properties=payload.properties,
    )
    return MonetizationEventOut(ok=True, event_name=payload.event_name)


@router.get("/metrics")
def monetization_metrics(db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = db.execute(
        select(ProductEvent.event_name, func.count(ProductEvent.id))
        .where(ProductEvent.event_name.in_(EVENT_NAMES))
        .group_by(ProductEvent.event_name)
    ).all()
    counts = {name: int(count) for name, count in rows}
    for name in EVENT_NAMES:
        counts.setdefault(name, 0)

    teaser_shown = counts["premium_teaser_shown"]
    teaser_clicked = counts["premium_teaser_clicked"]
    ad_impressions = counts["ad_impression"]
    ad_closed = counts["ad_closed"]
    offer_shown = counts["ad_free_offer_shown"]
    accepted = counts["ad_free_offer_accepted"]
    declined = counts["ad_free_offer_declined"]
    decisions = accepted + declined

    return {
        "counts": counts,
        "teaser_ctr_percent": _pct(teaser_clicked, teaser_shown),
        "ad_close_rate_percent": _pct(ad_closed, ad_impressions),
        "offer_decision_rate_percent": _pct(decisions, offer_shown),
        "ad_free_acceptance_percent": _pct(accepted, decisions),
    }
