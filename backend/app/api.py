from math import asin, cos, radians, sin, sqrt

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .analytics import track
from .company_weather import MAX_STATION_DISTANCE_KM
from .database import get_db
from .models import Comment, FarmAccessRequest, Field, Neighbor, Post, ProductEvent, Reaction, User, WeatherStation
from .schemas import (
    CommentCreate,
    CommentOut,
    FeedPostOut,
    FieldCreate,
    FieldOut,
    FarmAccessModeUpdate,
    FieldPrivacyUpdate,
    FarmAccessRequestCreate,
    FarmAccessRequestOut,
    FarmAccessRequestStatusUpdate,
    NearbyFarmerOut,
    NeighborOut,
    PostCreate,
    PublicFieldOut,
    ReactionSet,
    UserOut,
    UserUpdate,
)

router = APIRouter(prefix="/api")


def _get_user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _get_field_or_404(db: Session, field_id: int) -> Field:
    field = db.get(Field, field_id)
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    return field


def _get_post_or_404(db: Session, post_id: int) -> Post:
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


def _profile_complete(user: User) -> bool:
    return all(
        value.strip()
        for value in [user.name, user.region, user.specialization, user.farm_name, user.bio]
    )


def _access_request(db: Session, owner_id: int, requester_id: int | None) -> FarmAccessRequest | None:
    if requester_id is None or requester_id == owner_id:
        return None
    return db.scalar(
        select(FarmAccessRequest).where(
            FarmAccessRequest.owner_id == owner_id,
            FarmAccessRequest.requester_id == requester_id,
        )
    )


def _public_field(db: Session, field: Field, viewer_id: int | None) -> PublicFieldOut:
    request = _access_request(db, field.owner_id, viewer_id)
    request_status = request.status if request else None
    details_visible = field.owner.field_access_mode == "A" or viewer_id == field.owner_id or request_status == "approved"

    return PublicFieldOut(
        id=field.id,
        owner_id=field.owner_id,
        owner_name=field.owner.name,
        owner_username=field.owner.username,
        owner_region=field.owner.region,
        privacy_variant=field.privacy_variant,
        details_visible=details_visible,
        name=field.name if details_visible else None,
        crop=field.crop if details_visible else None,
        rotation=field.rotation if details_visible else None,
        area_ha=field.area_ha if details_visible else None,
        latitude=field.latitude if details_visible else None,
        longitude=field.longitude if details_visible else None,
        approximate_latitude=round(field.latitude, 1),
        approximate_longitude=round(field.longitude, 1),
        access_request_status=request_status,
    )


def _farm_access_request_out(db: Session, request: FarmAccessRequest) -> FarmAccessRequestOut:
    return FarmAccessRequestOut(
        id=request.id,
        owner_id=request.owner_id,
        requester_id=request.requester_id,
        requester_name=request.requester.name,
        requester_username=request.requester.username,
        message=request.message,
        status=request.status,
        fields_count=db.scalar(select(func.count(Field.id)).where(Field.owner_id == request.owner_id)) or 0,
        created_at=request.created_at,
    )


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return radius * 2 * asin(sqrt(a))


def _feed_post(post: Post, viewer: User | None, viewer_field: Field | None) -> FeedPostOut:
    healthy_count = sum(1 for reaction in post.reactions if reaction.value == 1)
    wilted_count = sum(1 for reaction in post.reactions if reaction.value == -1)
    viewer_reaction = None
    if viewer:
        own_reaction = next((reaction for reaction in post.reactions if reaction.user_id == viewer.id), None)
        viewer_reaction = own_reaction.value if own_reaction else None

    distance = None
    if viewer_field:
        distance = round(
            _distance_km(viewer_field.latitude, viewer_field.longitude, post.latitude, post.longitude),
            1,
        )

    return FeedPostOut(
        id=post.id,
        text=post.text,
        status=post.status,
        photo_data_url=post.photo_data_url,
        latitude=post.latitude,
        longitude=post.longitude,
        is_private=post.is_private,
        created_at=post.created_at,
        author=UserOut.model_validate(post.author),
        field_id=post.field_id,
        field_name=post.field.name,
        crop=post.field.crop,
        distance_km=distance,
        healthy_count=healthy_count,
        wilted_count=wilted_count,
        score=healthy_count - wilted_count,
        viewer_reaction=viewer_reaction,
        comments=[
            CommentOut(
                id=comment.id,
                author=UserOut.model_validate(comment.author),
                text=comment.text,
                created_at=comment.created_at,
            )
            for comment in sorted(post.comments, key=lambda item: (item.created_at, item.id))
        ],
    )


def _neighbor_out(db: Session, neighbor: Neighbor) -> NeighborOut:
    neighbor_user = _get_user_or_404(db, neighbor.neighbor_user_id)
    request = _access_request(db, neighbor_user.id, neighbor.user_id)
    return NeighborOut(
        user=UserOut.model_validate(neighbor_user),
        created_at=neighbor.created_at,
        fields_count=db.scalar(select(func.count(Field.id)).where(Field.owner_id == neighbor_user.id)) or 0,
        total_area_ha=round(float(db.scalar(select(func.coalesce(func.sum(Field.area_ha), 0)).where(Field.owner_id == neighbor_user.id)) or 0), 1),
        access_request_status=request.status if request else None,
    )


@router.get("/health", tags=["System"], summary="Проверить доступность API")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "agroconnect-api"}


@router.get("/users", response_model=list[UserOut], tags=["Users"], summary="Получить тестовых пользователей")
def list_users(db: Session = Depends(get_db)) -> list[User]:
    return list(db.scalars(select(User).order_by(User.id)).all())


@router.get("/users/{user_id}", response_model=UserOut, tags=["Users"], summary="Получить профиль пользователя")
def get_user(user_id: int, db: Session = Depends(get_db)) -> User:
    user = _get_user_or_404(db, user_id)
    track("profile_viewed", user_id=user_id)
    return user


@router.put("/users/{user_id}", response_model=UserOut, tags=["Users"], summary="Обновить профиль хозяйства")
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)) -> User:
    user = _get_user_or_404(db, user_id)
    for key, value in payload.model_dump().items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    track("profile_updated", user_id=user.id)
    if _profile_complete(user):
        track("profile_completed", user_id=user.id)
    return user


@router.get("/users/{user_id}/fields", response_model=list[FieldOut], tags=["Fields"], summary="Получить поля хозяйства")
def list_user_fields(user_id: int, db: Session = Depends(get_db)) -> list[Field]:
    _get_user_or_404(db, user_id)
    return list(db.scalars(select(Field).where(Field.owner_id == user_id).order_by(Field.id)).all())


@router.post("/users/{user_id}/fields", response_model=FieldOut, status_code=status.HTTP_201_CREATED, tags=["Fields"], summary="Добавить поле в хозяйство")
def create_field(user_id: int, payload: FieldCreate, db: Session = Depends(get_db)) -> Field:
    owner = _get_user_or_404(db, user_id)
    values = payload.model_dump()
    values["privacy_variant"] = owner.field_access_mode
    stations = list(db.scalars(select(WeatherStation)).all())
    if stations:
        nearest = min(stations, key=lambda station: _distance_km(payload.latitude, payload.longitude, station.latitude, station.longitude))
        distance = _distance_km(payload.latitude, payload.longitude, nearest.latitude, nearest.longitude)
        if distance <= MAX_STATION_DISTANCE_KM:
            values["weather_station_id"] = nearest.id
            values["weather_station_distance_km"] = round(distance, 1)
    field = Field(owner_id=user_id, **values)
    db.add(field)
    db.commit()
    db.refresh(field)
    properties = {"field_id": field.id, "crop": field.crop}
    track("field_created", user_id=user_id, experiment_variant=field.privacy_variant, properties=properties)
    track("field_location_added", user_id=user_id, experiment_variant=field.privacy_variant, properties=properties)
    return field


@router.get("/fields/{field_id}", response_model=FieldOut, tags=["Fields"], summary="Получить собственное поле")
def get_field(field_id: int, db: Session = Depends(get_db)) -> Field:
    field = _get_field_or_404(db, field_id)
    track("field_opened", user_id=field.owner_id, experiment_variant=field.privacy_variant, properties={"field_id": field.id})
    return field


@router.put("/fields/{field_id}/privacy", response_model=FieldOut, tags=["Fields"], summary="Изменить режим доступа всего хозяйства")
def update_field_privacy(field_id: int, payload: FieldPrivacyUpdate, db: Session = Depends(get_db)) -> Field:
    field = _get_field_or_404(db, field_id)
    if field.owner_id != payload.owner_id:
        raise HTTPException(status_code=403, detail="Only field owner can change privacy")
    field.owner.field_access_mode = payload.privacy_variant
    for owned_field in db.scalars(select(Field).where(Field.owner_id == field.owner_id)).all():
        owned_field.privacy_variant = payload.privacy_variant
    db.commit()
    db.refresh(field)
    track("field_privacy_changed", user_id=field.owner_id, experiment_variant=field.privacy_variant, properties={"field_id": field.id})
    return field


@router.put("/users/{owner_id}/field-access-mode", response_model=list[FieldOut], tags=["Fields"], summary="Установить единый доступ ко всем полям")
def update_farm_access_mode(owner_id: int, payload: FarmAccessModeUpdate, db: Session = Depends(get_db)) -> list[Field]:
    owner = _get_user_or_404(db, owner_id)
    if owner.id != payload.owner_id:
        raise HTTPException(status_code=403, detail="Only farm owner can change access mode")
    owner.field_access_mode = payload.field_access_mode
    fields = list(db.scalars(select(Field).where(Field.owner_id == owner.id).order_by(Field.id)).all())
    for field in fields:
        field.privacy_variant = payload.field_access_mode
    db.commit()
    track("farm_access_mode_changed", user_id=owner.id, experiment_variant=payload.field_access_mode, properties={"fields": len(fields)})
    return fields


@router.get("/public/fields", response_model=list[PublicFieldOut], tags=["Fields"], summary="Получить поля с учётом доступа зрителя")
def list_public_fields(viewer_id: int | None = None, db: Session = Depends(get_db)) -> list[PublicFieldOut]:
    if viewer_id is not None:
        _get_user_or_404(db, viewer_id)
    fields = list(db.scalars(select(Field).order_by(Field.id)).all())
    return [_public_field(db, field, viewer_id) for field in fields]


@router.get("/public/fields/{field_id}", response_model=PublicFieldOut)
def get_public_field(field_id: int, viewer_id: int | None = None, db: Session = Depends(get_db)) -> PublicFieldOut:
    if viewer_id is not None:
        _get_user_or_404(db, viewer_id)
    field = _get_field_or_404(db, field_id)
    result = _public_field(db, field, viewer_id)
    event_name = "public_field_viewed" if result.details_visible else "private_field_viewed"
    track(event_name, user_id=viewer_id, experiment_variant=field.privacy_variant, properties={"field_id": field.id, "owner_id": field.owner_id})
    return result


@router.post("/neighbors/{owner_id}/access-requests", response_model=FarmAccessRequestOut, status_code=status.HTTP_201_CREATED, tags=["Neighbors"], summary="Запросить доступ ко всем полям соседа")
def create_farm_access_request(owner_id: int, payload: FarmAccessRequestCreate, db: Session = Depends(get_db)) -> FarmAccessRequestOut:
    owner = _get_user_or_404(db, owner_id)
    requester = _get_user_or_404(db, payload.requester_id)
    if owner.id == requester.id:
        raise HTTPException(status_code=400, detail="You cannot request access to your own fields")
    relation = db.scalar(select(Neighbor).where(Neighbor.user_id == requester.id, Neighbor.neighbor_user_id == owner.id))
    if not relation:
        raise HTTPException(status_code=409, detail="Add this farmer to neighbors before requesting access")
    existing = _access_request(db, owner.id, requester.id)
    if existing:
        if existing.status == "declined":
            existing.status = "pending"
            existing.message = payload.message.strip()
            db.commit()
            db.refresh(existing)
            track("farm_access_request_sent", user_id=requester.id, properties={"owner_id": owner.id, "resent": True})
        return _farm_access_request_out(db, existing)
    request = FarmAccessRequest(owner_id=owner.id, requester_id=requester.id, message=payload.message.strip())
    db.add(request)
    db.commit()
    db.refresh(request)
    track("farm_access_request_sent", user_id=requester.id, properties={"owner_id": owner.id})
    return _farm_access_request_out(db, request)


@router.get("/users/{owner_id}/access-requests/incoming", response_model=list[FarmAccessRequestOut], tags=["Neighbors"], summary="Получить входящие заявки доступа")
def incoming_farm_access_requests(owner_id: int, db: Session = Depends(get_db)) -> list[FarmAccessRequestOut]:
    _get_user_or_404(db, owner_id)
    rows = list(db.scalars(select(FarmAccessRequest).where(FarmAccessRequest.owner_id == owner_id).order_by(FarmAccessRequest.created_at.desc(), FarmAccessRequest.id.desc())).all())
    return [_farm_access_request_out(db, row) for row in rows]


@router.get("/users/{requester_id}/access-requests/outgoing", response_model=list[FarmAccessRequestOut])
def outgoing_farm_access_requests(requester_id: int, db: Session = Depends(get_db)) -> list[FarmAccessRequestOut]:
    _get_user_or_404(db, requester_id)
    rows = list(db.scalars(select(FarmAccessRequest).where(FarmAccessRequest.requester_id == requester_id).order_by(FarmAccessRequest.created_at.desc(), FarmAccessRequest.id.desc())).all())
    return [_farm_access_request_out(db, row) for row in rows]


@router.put("/access-requests/{request_id}", response_model=FarmAccessRequestOut, tags=["Neighbors"], summary="Одобрить или отклонить заявку доступа")
def update_farm_access_request(request_id: int, payload: FarmAccessRequestStatusUpdate, db: Session = Depends(get_db)) -> FarmAccessRequestOut:
    request = db.get(FarmAccessRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Access request not found")
    if request.owner_id != payload.owner_id:
        raise HTTPException(status_code=403, detail="Only farm owner can answer this request")
    request.status = payload.status
    db.commit()
    db.refresh(request)
    track("farm_access_request_approved" if payload.status == "approved" else "farm_access_request_rejected", user_id=payload.owner_id, properties={"requester_id": request.requester_id})
    return _farm_access_request_out(db, request)


@router.post("/posts", response_model=FeedPostOut, status_code=status.HTTP_201_CREATED, tags=["Feed"], summary="Опубликовать запись с поля")
def create_post(payload: PostCreate, db: Session = Depends(get_db)) -> FeedPostOut:
    author = _get_user_or_404(db, payload.author_id)
    field = _get_field_or_404(db, payload.field_id)
    if field.owner_id != author.id:
        raise HTTPException(status_code=403, detail="You can publish only from your own field")
    if not payload.photo_data_url.startswith("data:image/"):
        raise HTTPException(status_code=422, detail="Photo must be an image data URL")
    post = Post(**payload.model_dump())
    db.add(post)
    db.commit()
    db.refresh(post)
    track("post_created", user_id=author.id, experiment_variant=field.privacy_variant, properties={"post_id": post.id, "field_id": field.id, "status": post.status})
    return _feed_post(post, author, field)


@router.get("/feed", response_model=list[FeedPostOut], tags=["Feed"], summary="Получить локальную ленту и посты соседей")
def feed(viewer_id: int, only_mine: bool = False, db: Session = Depends(get_db)) -> list[FeedPostOut]:
    viewer = _get_user_or_404(db, viewer_id)
    viewer_field = db.scalar(select(Field).where(Field.owner_id == viewer.id).order_by(Field.id))
    posts = list(db.scalars(select(Post).order_by(Post.created_at.desc(), Post.id.desc())).all())
    neighbor_ids = set(db.scalars(select(Neighbor.neighbor_user_id).where(Neighbor.user_id == viewer.id)).all())

    result = []
    for post in posts:
        if post.is_private and post.author_id != viewer.id:
            continue
        if only_mine and post.author_id != viewer.id:
            continue
        item = _feed_post(post, viewer, viewer_field)
        if (
            item.distance_km is None
            or post.author_id == viewer.id
            or post.author_id in neighbor_ids
            or item.distance_km <= viewer.news_radius_km
        ):
            result.append(item)

    # Keep the feed readable as a field diary: today first, then yesterday, etc.
    # Within each calendar day, give unassessed posts a chance to be noticed before
    # ordering the already rated ones by score.
    result.sort(
        key=lambda item: (
            -item.created_at.date().toordinal(),
            0 if item.score == 0 else 1,
            -item.score if item.score != 0 else 0,
            -item.created_at.timestamp(),
            -item.id,
        )
    )
    track("feed_opened", user_id=viewer.id, properties={"items": len(result), "radius_km": viewer.news_radius_km, "neighbors": len(neighbor_ids), "only_mine": only_mine})
    return result


@router.put("/posts/{post_id}/reaction", response_model=FeedPostOut)
def set_reaction(post_id: int, payload: ReactionSet, db: Session = Depends(get_db)) -> FeedPostOut:
    post = _get_post_or_404(db, post_id)
    viewer = _get_user_or_404(db, payload.user_id)
    reaction = db.scalar(select(Reaction).where(Reaction.post_id == post.id, Reaction.user_id == viewer.id))
    if reaction and reaction.value == payload.value:
        db.delete(reaction)
        event_name = "reaction_removed"
    elif reaction:
        reaction.value = payload.value
        event_name = "reaction_changed"
    else:
        db.add(Reaction(post_id=post.id, user_id=viewer.id, value=payload.value))
        event_name = "reaction_added"
    db.commit()
    db.refresh(post)
    track(event_name, user_id=viewer.id, properties={"post_id": post.id, "value": payload.value})
    viewer_field = db.scalar(select(Field).where(Field.owner_id == viewer.id).order_by(Field.id))
    return _feed_post(post, viewer, viewer_field)


@router.post("/posts/{post_id}/comments", response_model=FeedPostOut, status_code=status.HTTP_201_CREATED)
def create_comment(post_id: int, payload: CommentCreate, db: Session = Depends(get_db)) -> FeedPostOut:
    post = _get_post_or_404(db, post_id)
    author = _get_user_or_404(db, payload.author_id)
    db.add(Comment(post_id=post.id, author_id=author.id, text=payload.text.strip()))
    db.commit()
    db.refresh(post)
    track("comment_created", user_id=author.id, properties={"post_id": post.id})
    viewer_field = db.scalar(select(Field).where(Field.owner_id == author.id).order_by(Field.id))
    return _feed_post(post, author, viewer_field)


@router.get("/neighbors", response_model=list[NeighborOut], tags=["Neighbors"], summary="Получить добавленных соседей")
def list_neighbors(user_id: int, db: Session = Depends(get_db)) -> list[NeighborOut]:
    _get_user_or_404(db, user_id)
    rows = list(db.scalars(select(Neighbor).where(Neighbor.user_id == user_id).order_by(Neighbor.created_at.desc(), Neighbor.id.desc())).all())
    return [_neighbor_out(db, row) for row in rows]


@router.get("/neighbors/search", response_model=list[UserOut], tags=["Neighbors"], summary="Найти фермера по имени или нику")
def search_neighbors(user_id: int, q: str = Query(min_length=2, max_length=80), db: Session = Depends(get_db)) -> list[UserOut]:
    _get_user_or_404(db, user_id)
    needle = f"%{q.strip().removeprefix('@').lower()}%"
    rows = db.scalars(
        select(User).where(User.id != user_id).where(
            func.lower(User.name).like(needle) | func.lower(User.username).like(needle)
        ).order_by(User.name).limit(20)
    ).all()
    return [UserOut.model_validate(row) for row in rows]


@router.get("/nearby-farmers", response_model=list[NearbyFarmerOut], tags=["Neighbors"], summary="Найти хозяйства рядом с полями пользователя")
def nearby_farmers(
    user_id: int,
    radius_km: int = Query(50, ge=50, le=1000),
    db: Session = Depends(get_db),
) -> list[NearbyFarmerOut]:
    viewer = _get_user_or_404(db, user_id)
    if radius_km % 50 != 0:
        raise HTTPException(status_code=422, detail="Radius must use a 50 km step")
    viewer_fields = list(db.scalars(select(Field).where(Field.owner_id == viewer.id)).all())
    if not viewer_fields:
        return []
