from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .analytics import track
from .database import get_db
from .models import Alert, AlertRecipient, Field, Neighbor, PlantHealthAnalysis, Post, User
from .plant_health import PlantHealthProviderError, get_plant_health_provider, provider_status

router = APIRouter(prefix="/api/ml", tags=["plant-health"])


class AnalyzeRequest(BaseModel):
    user_id: int
    field_id: int
    image_data_url: str = PydanticField(min_length=20, max_length=4_500_000)
    provider: str | None = None


class FeedbackRequest(BaseModel):
    user_id: int
    verdict: str
    corrected_label: str | None = PydanticField(default=None, max_length=240)


class LinkPostRequest(BaseModel):
    user_id: int
    post_id: int


class NotifyRequest(BaseModel):
    user_id: int


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return radius * 2 * asin(sqrt(a))


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _get_analysis(db: Session, analysis_id: int) -> PlantHealthAnalysis:
    analysis = db.get(PlantHealthAnalysis, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="ML analysis not found")
    return analysis


def _analysis_out(row: PlantHealthAnalysis, include_image: bool = False) -> dict:
    data = {
        "id": row.id,
        "user_id": row.user_id,
        "field_id": row.field_id,
        "provider": row.provider,
        "crop_hint": row.crop_hint,
        "image_sha256": row.image_sha256,
        "suggestions": row.predictions,
        "top_label": row.top_label,
        "top_confidence": row.top_confidence,
        "feedback_status": row.feedback_status,
        "final_label": row.final_label,
        "posted_post_id": row.posted_post_id,
        "created_at": row.created_at.isoformat(),
        "feedback_at": row.feedback_at.isoformat() if row.feedback_at else None,
    }
    if include_image:
        data["image_data_url"] = row.image_data_url
    return data


@router.get("/providers")
def providers() -> dict:
    import os

    return {
        "default": os.getenv("PLANT_HEALTH_PROVIDER", "kindwise").strip().lower(),
        "providers": provider_status(),
    }


@router.post("/analyze", status_code=status.HTTP_201_CREATED)
def analyze(payload: AnalyzeRequest, db: Session = Depends(get_db)) -> dict:
    user = _get_user(db, payload.user_id)
    field = db.get(Field, payload.field_id)
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    if field.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Analyze photos only for your own field")
    if not payload.image_data_url.startswith("data:image/"):
        raise HTTPException(status_code=422, detail="Photo must be an image data URL")

    selected = (payload.provider or "").strip().lower() or None
    track(
        "ml_started",
        user_id=user.id,
        experiment_variant=field.privacy_variant,
        properties={"field_id": field.id, "provider": selected or "default"},
    )
    try:
        provider = get_plant_health_provider(selected)
        result = provider.analyze(payload.image_data_url, crop_hint=field.crop)
    except PlantHealthProviderError as exc:
        track(
            "ml_provider_failed",
            user_id=user.id,
            experiment_variant=field.privacy_variant,
            properties={"field_id": field.id, "provider": selected or "default", "error": str(exc)[:300]},
        )
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    suggestions = [item.as_dict() for item in result.suggestions]
    top = suggestions[0]
    image_hash = hashlib.sha256(payload.image_data_url.encode("utf-8")).hexdigest()
    row = PlantHealthAnalysis(
        user_id=user.id,
        field_id=field.id,
        provider=result.provider,
        crop_hint=field.crop,
        image_data_url=payload.image_data_url,
        image_sha256=image_hash,
        predictions=suggestions,
        top_label=top["label"],
        top_confidence=float(top["confidence"]),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    track(
        "ml_result_shown",
        user_id=user.id,
        experiment_variant=field.privacy_variant,
        properties={
            "analysis_id": row.id,
            "field_id": field.id,
            "provider": row.provider,
            "top_label": row.top_label,
            "top_confidence": row.top_confidence,
        },
    )
    return _analysis_out(row)


@router.put("/analyses/{analysis_id}/feedback")
def feedback(analysis_id: int, payload: FeedbackRequest, db: Session = Depends(get_db)) -> dict:
    analysis = _get_analysis(db, analysis_id)
    if analysis.user_id != payload.user_id:
        raise HTTPException(status_code=403, detail="This analysis belongs to another user")
    verdict = payload.verdict.strip().lower()
    if verdict not in {"accepted", "rejected", "corrected"}:
        raise HTTPException(status_code=422, detail="verdict must be accepted, rejected or corrected")
    corrected = (payload.corrected_label or "").strip()
    if verdict == "corrected" and not corrected:
        raise HTTPException(status_code=422, detail="corrected_label is required for corrected feedback")

    analysis.feedback_status = verdict
    analysis.final_label = analysis.top_label if verdict == "accepted" else corrected or None
    analysis.feedback_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(analysis)

    event_name = {
        "accepted": "ml_result_accepted",
        "rejected": "ml_result_rejected",
        "corrected": "ml_result_corrected",
    }[verdict]
    track(
        event_name,
        user_id=analysis.user_id,
        properties={
            "analysis_id": analysis.id,
            "provider": analysis.provider,
            "top_label": analysis.top_label,
            "final_label": analysis.final_label,
        },
    )
    if analysis.final_label:
        track(
            "ml_dataset_labeled",
            user_id=analysis.user_id,
            properties={"analysis_id": analysis.id, "provider": analysis.provider, "label": analysis.final_label},
        )
    return _analysis_out(analysis)


@router.put("/analyses/{analysis_id}/post")
def link_post(analysis_id: int, payload: LinkPostRequest, db: Session = Depends(get_db)) -> dict:
    analysis = _get_analysis(db, analysis_id)
    if analysis.user_id != payload.user_id:
        raise HTTPException(status_code=403, detail="This analysis belongs to another user")
    post = db.get(Post, payload.post_id)
    if not post or post.author_id != payload.user_id or post.field_id != analysis.field_id:
        raise HTTPException(status_code=422, detail="Post does not match the analysis")
    if post.status != "problem":
        raise HTTPException(status_code=422, detail="ML analysis can be linked only to a problem post")
    analysis.posted_post_id = post.id
    db.commit()
    db.refresh(analysis)
    track(
        "post_created_after_ml",
        user_id=analysis.user_id,
        properties={"analysis_id": analysis.id, "post_id": post.id, "provider": analysis.provider},
    )
    return _analysis_out(analysis)


@router.post("/analyses/{analysis_id}/notify-neighbors", status_code=status.HTTP_201_CREATED)
def notify_neighbors(analysis_id: int, payload: NotifyRequest, db: Session = Depends(get_db)) -> dict:
    analysis = _get_analysis(db, analysis_id)
    if analysis.user_id != payload.user_id:
        raise HTTPException(status_code=403, detail="This analysis belongs to another user")
    if analysis.feedback_status not in {"accepted", "corrected"} or not analysis.final_label:
        raise HTTPException(status_code=409, detail="Confirm or correct the ML result first")
    if analysis.posted_post_id is None:
        raise HTTPException(status_code=409, detail="Publish the problem post first")

    author = _get_user(db, analysis.user_id)
    field = db.get(Field, analysis.field_id)
    assert field is not None
    alert = Alert(
        author_id=author.id,
        field_id=field.id,
        type="disease",
        latitude=field.latitude,
        longitude=field.longitude,
        radius_km=author.broadcast_radius_km,
        starts_at=None,
        payload={
            "title": f"Проблема на поле: {analysis.final_label}",
            "details": "Предварительная AI-подсказка подтверждена владельцем поля. Проверьте ситуацию у себя.",
            "analysis_id": analysis.id,
            "post_id": analysis.posted_post_id,
            "provider": analysis.provider,
        },
    )
    db.add(alert)
    db.flush()

    recipients = 0
    neighbors = list(db.scalars(select(Neighbor).where(Neighbor.user_id == author.id)).all())
    for relation in neighbors:
        neighbor = db.get(User, relation.neighbor_user_id)
        if not neighbor:
            continue
        neighbor_field = db.scalar(select(Field).where(Field.owner_id == neighbor.id).order_by(Field.id))
        if not neighbor_field:
            continue
        distance = _distance_km(field.latitude, field.longitude, neighbor_field.latitude, neighbor_field.longitude)
        if distance <= author.broadcast_radius_km and distance <= neighbor.news_radius_km:
            db.add(
                AlertRecipient(
                    alert_id=alert.id,
                    user_id=neighbor.id,
                    apiary_id=None,
                    distance_km=distance,
                )
            )
            recipients += 1

    db.commit()
    track(
        "ml_neighbor_warning_sent",
        user_id=author.id,
        properties={"analysis_id": analysis.id, "alert_id": alert.id, "recipients": recipients},
    )
    for recipient in db.scalars(select(AlertRecipient).where(AlertRecipient.alert_id == alert.id)).all():
        track(
            "alert_received",
            user_id=recipient.user_id,
            properties={"alert_id": alert.id, "type": "disease", "distance_km": round(recipient.distance_km, 1)},
        )
    return {"alert_id": alert.id, "recipients": recipients}


@router.get("/dataset")
def dataset(include_images: bool = False, labeled_only: bool = True, db: Session = Depends(get_db)) -> dict:
    query = select(PlantHealthAnalysis).order_by(PlantHealthAnalysis.created_at.desc(), PlantHealthAnalysis.id.desc())
    if labeled_only:
        query = query.where(PlantHealthAnalysis.final_label.is_not(None))
    rows = list(db.scalars(query).all())
    provider_rows = db.execute(
        select(PlantHealthAnalysis.provider, func.count(PlantHealthAnalysis.id)).group_by(PlantHealthAnalysis.provider)
    ).all()
    return {
        "summary": {
            "analyses": db.scalar(select(func.count(PlantHealthAnalysis.id))) or 0,
            "labeled": db.scalar(select(func.count(PlantHealthAnalysis.id)).where(PlantHealthAnalysis.final_label.is_not(None))) or 0,
            "accepted": db.scalar(select(func.count(PlantHealthAnalysis.id)).where(PlantHealthAnalysis.feedback_status == "accepted")) or 0,
            "corrected": db.scalar(select(func.count(PlantHealthAnalysis.id)).where(PlantHealthAnalysis.feedback_status == "corrected")) or 0,
            "rejected": db.scalar(select(func.count(PlantHealthAnalysis.id)).where(PlantHealthAnalysis.feedback_status == "rejected")) or 0,
            "providers": {name: count for name, count in provider_rows},
        },
        "items": [_analysis_out(row, include_image=include_images) for row in rows],
    }
