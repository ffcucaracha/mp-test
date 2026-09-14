from math import asin, cos, radians, sin, sqrt

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .analytics import track
from .database import get_db
from .models import Field, Neighbor, User
from .schemas import NearbyFarmerOut, UserOut

router = APIRouter(prefix="/api")


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return radius * 2 * asin(sqrt(a))


@router.get(
    "/nearby-farmers",
    response_model=list[NearbyFarmerOut],
    tags=["Neighbors"],
    summary="Найти хозяйства рядом с полями пользователя",
)
def nearby_farmers(
    user_id: int,
    radius_km: int = Query(50, ge=50, le=1000),
    db: Session = Depends(get_db),
) -> list[NearbyFarmerOut]:
    viewer = db.get(User, user_id)
    if not viewer:
        raise HTTPException(status_code=404, detail="User not found")
    if radius_km % 50 != 0:
        raise HTTPException(status_code=422, detail="Radius must use a 50 km step")

    viewer_fields = [
        field
        for field in db.scalars(select(Field).where(Field.owner_id == viewer.id)).all()
        if field.latitude is not None and field.longitude is not None
    ]
    if not viewer_fields:
        return []

    neighbor_ids = set(
        db.scalars(
            select(Neighbor.neighbor_user_id).where(Neighbor.user_id == viewer.id)
        ).all()
    )

    result: list[NearbyFarmerOut] = []
    farmers = db.scalars(select(User).where(User.id != viewer.id).order_by(User.id)).all()
    for farmer in farmers:
        if farmer.id in neighbor_ids:
            continue

        farmer_fields = [
            field
            for field in db.scalars(select(Field).where(Field.owner_id == farmer.id)).all()
            if field.latitude is not None and field.longitude is not None
        ]
        if not farmer_fields:
            continue

        distance = min(
            _distance_km(own.latitude, own.longitude, candidate.latitude, candidate.longitude)
            for own in viewer_fields
            for candidate in farmer_fields
        )
        if distance > radius_km:
            continue

        result.append(
            NearbyFarmerOut(
                user=UserOut.model_validate(farmer),
                fields_count=len(farmer_fields),
                total_area_ha=round(sum(field.area_ha or 0 for field in farmer_fields), 1),
                nearest_field_distance_km=round(distance, 1),
            )
        )

    result.sort(key=lambda item: (item.nearest_field_distance_km, item.user.name))
    track(
        "nearby_farmers_opened",
        user_id=viewer.id,
        properties={"radius_km": radius_km, "items": len(result)},
    )
    return result
