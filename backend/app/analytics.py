from __future__ import annotations

from typing import Any

from .database import SessionLocal
from .models import ProductEvent


def track(
    event_name: str,
    *,
    user_id: int | None = None,
    experiment_variant: str | None = None,
    properties: dict[str, Any] | None = None,
) -> None:
    """Persist a product event without coupling it to the caller transaction."""
    with SessionLocal() as db:
        db.add(
            ProductEvent(
                event_name=event_name,
                user_id=user_id,
                experiment_variant=experiment_variant,
                properties=properties or {},
            )
        )
        db.commit()
