from math import asin, cos, radians, sin, sqrt

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import Comment, Field, Post, Reaction, User, VisitRequest
from .schemas import (
    CommentCreate,
    CommentOut,
    FeedPostOut,
    FieldCreate,
    FieldOut,
    FieldPrivacyUpdate,
    PostCreate,
    PublicFieldOut,
    ReactionSet,
    UserOut,
    UserUpdate,
    VisitRequestCreate,
    VisitRequestOut,
    VisitRequestStatusUpdate,
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


def _visit_status(db: Session, field_id: int, viewer_id: int | None) -> str | None:
    if viewer_id is None:
        return None
    request = db.scalar(
        select(VisitRequest).where(
            VisitRequest.field_id == field_id,
            VisitRequest.requester_id == viewer_id,
        )
    )
    return request.status if request else None


def _public_field(db: Session, field: Field, viewer_id: int | None) -> PublicFieldOut:
    request_status = _visit_status(db, field.id, viewer_id)
    details_visible = field.privacy_variant == "A" or viewer_id == field.owner_id or request_status == "approved"

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
        visit_request_status=request_status,
    )


def _visit_request_out(request: VisitRequest) -> VisitRequestOut:
    return VisitRequestOut(
        id=request.id,
        field_id=request.field_id,
        field_name=request.field.name,
        owner_id=request.field.owner_id,
        requester_id=request.requester_id,
        requester_name=request.requester.name,
        requester_username=request.requester.username,
        message=request.message,
        status=request.status,
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


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "agroconnect-api"}


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)) -> list[User]:
    return list(db.scalars(select(User).order_by(User.id)).all())


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)) -> User:
    return _get_user_or_404(db, user_id)


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)) -> User:
    user = _get_user_or_404(db, user_id)
    for key, value in payload.model_dump().items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.get("/users/{user_id}/fields", response_model=list[FieldOut])
def list_user_fields(user_id: int, db: Session = Depends(get_db)) -> list[Field]:
    _get_user_or_404(db, user_id)
    return list(db.scalars(select(Field).where(Field.owner_id == user_id).order_by(Field.id)).all())


@router.post("/users/{user_id}/fields", response_model=FieldOut, status_code=status.HTTP_201_CREATED)
def create_field(user_id: int, payload: FieldCreate, db: Session = Depends(get_db)) -> Field:
    _get_user_or_404(db, user_id)
    field = Field(owner_id=user_id, **payload.model_dump())
    db.add(field)
    db.commit()
    db.refresh(field)
    return field


@router.get("/fields/{field_id}", response_model=FieldOut)
def get_field(field_id: int, db: Session = Depends(get_db)) -> Field:
    return _get_field_or_404(db, field_id)


@router.put("/fields/{field_id}/privacy", response_model=FieldOut)
def update_field_privacy(field_id: int, payload: FieldPrivacyUpdate, db: Session = Depends(get_db)) -> Field:
    field = _get_field_or_404(db, field_id)
    if field.owner_id != payload.owner_id:
        raise HTTPException(status_code=403, detail="Only field owner can change privacy")
    field.privacy_variant = payload.privacy_variant
    db.commit()
    db.refresh(field)
    return field


@router.get("/public/fields", response_model=list[PublicFieldOut])
def list_public_fields(viewer_id: int | None = None, db: Session = Depends(get_db)) -> list[PublicFieldOut]:
    if viewer_id is not None:
        _get_user_or_404(db, viewer_id)
    fields = list(db.scalars(select(Field).order_by(Field.id)).all())
    return [_public_field(db, field, viewer_id) for field in fields]


@router.get("/public/fields/{field_id}", response_model=PublicFieldOut)
def get_public_field(field_id: int, viewer_id: int | None = None, db: Session = Depends(get_db)) -> PublicFieldOut:
    if viewer_id is not None:
        _get_user_or_404(db, viewer_id)
    return _public_field(db, _get_field_or_404(db, field_id), viewer_id)


@router.post("/fields/{field_id}/visit-requests", response_model=VisitRequestOut, status_code=status.HTTP_201_CREATED)
def create_visit_request(field_id: int, payload: VisitRequestCreate, db: Session = Depends(get_db)) -> VisitRequestOut:
    field = _get_field_or_404(db, field_id)
    requester = _get_user_or_404(db, payload.requester_id)
    if field.owner_id == requester.id:
        raise HTTPException(status_code=400, detail="You cannot request a visit to your own field")
    existing = db.scalar(select(VisitRequest).where(VisitRequest.field_id == field.id, VisitRequest.requester_id == requester.id))
    if existing:
        return _visit_request_out(existing)
    request = VisitRequest(field_id=field.id, requester_id=requester.id, message=payload.message)
    db.add(request)
    db.commit()
    db.refresh(request)
    return _visit_request_out(request)


@router.get("/users/{owner_id}/visit-requests/incoming", response_model=list[VisitRequestOut])
def incoming_visit_requests(owner_id: int, db: Session = Depends(get_db)) -> list[VisitRequestOut]:
    _get_user_or_404(db, owner_id)
    requests = list(
        db.scalars(
            select(VisitRequest)
            .join(Field, VisitRequest.field_id == Field.id)
            .where(Field.owner_id == owner_id)
            .order_by(VisitRequest.created_at.desc(), VisitRequest.id.desc())
        ).all()
    )
    return [_visit_request_out(request) for request in requests]


@router.get("/users/{requester_id}/visit-requests/outgoing", response_model=list[VisitRequestOut])
def outgoing_visit_requests(requester_id: int, db: Session = Depends(get_db)) -> list[VisitRequestOut]:
    _get_user_or_404(db, requester_id)
    requests = list(db.scalars(select(VisitRequest).where(VisitRequest.requester_id == requester_id).order_by(VisitRequest.created_at.desc(), VisitRequest.id.desc())).all())
    return [_visit_request_out(request) for request in requests]


@router.put("/visit-requests/{request_id}", response_model=VisitRequestOut)
def update_visit_request(request_id: int, payload: VisitRequestStatusUpdate, db: Session = Depends(get_db)) -> VisitRequestOut:
    request = db.get(VisitRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Visit request not found")
    if request.field.owner_id != payload.owner_id:
        raise HTTPException(status_code=403, detail="Only field owner can answer this request")
    request.status = payload.status
    db.commit()
    db.refresh(request)
    return _visit_request_out(request)


@router.post("/posts", response_model=FeedPostOut, status_code=status.HTTP_201_CREATED)
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
    return _feed_post(post, author, field)


@router.get("/feed", response_model=list[FeedPostOut])
def feed(viewer_id: int, db: Session = Depends(get_db)) -> list[FeedPostOut]:
    viewer = _get_user_or_404(db, viewer_id)
    viewer_field = db.scalar(select(Field).where(Field.owner_id == viewer.id).order_by(Field.id))
    posts = list(db.scalars(select(Post).order_by(Post.created_at.desc(), Post.id.desc())).all())

    result = []
    for post in posts:
        item = _feed_post(post, viewer, viewer_field)
        if item.distance_km is None or post.author_id == viewer.id or item.distance_km <= viewer.news_radius_km:
            result.append(item)

    result.sort(key=lambda item: (item.score, item.created_at), reverse=True)
    return result


@router.put("/posts/{post_id}/reaction", response_model=FeedPostOut)
def set_reaction(post_id: int, payload: ReactionSet, db: Session = Depends(get_db)) -> FeedPostOut:
    post = _get_post_or_404(db, post_id)
    viewer = _get_user_or_404(db, payload.user_id)
    reaction = db.scalar(select(Reaction).where(Reaction.post_id == post.id, Reaction.user_id == viewer.id))
    if reaction and reaction.value == payload.value:
        db.delete(reaction)
    elif reaction:
        reaction.value = payload.value
    else:
        db.add(Reaction(post_id=post.id, user_id=viewer.id, value=payload.value))
    db.commit()
    db.refresh(post)
    viewer_field = db.scalar(select(Field).where(Field.owner_id == viewer.id).order_by(Field.id))
    return _feed_post(post, viewer, viewer_field)


@router.post("/posts/{post_id}/comments", response_model=FeedPostOut, status_code=status.HTTP_201_CREATED)
def create_comment(post_id: int, payload: CommentCreate, db: Session = Depends(get_db)) -> FeedPostOut:
    post = _get_post_or_404(db, post_id)
    author = _get_user_or_404(db, payload.author_id)
    db.add(Comment(post_id=post.id, author_id=author.id, text=payload.text.strip()))
    db.commit()
    db.refresh(post)
    viewer_field = db.scalar(select(Field).where(Field.owner_id == author.id).order_by(Field.id))
    return _feed_post(post, author, viewer_field)
