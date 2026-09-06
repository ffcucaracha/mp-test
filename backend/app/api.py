from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import Field, Post, User, VisitRequest
from .schemas import (
    FieldCreate,
    FieldOut,
    FieldPrivacyUpdate,
    PostOut,
    PublicFieldOut,
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
    details_visible = (
        field.privacy_variant == "A"
        or viewer_id == field.owner_id
        or request_status == "approved"
    )

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
def update_field_privacy(
    field_id: int,
    payload: FieldPrivacyUpdate,
    db: Session = Depends(get_db),
) -> Field:
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


@router.post(
    "/fields/{field_id}/visit-requests",
    response_model=VisitRequestOut,
    status_code=status.HTTP_201_CREATED,
)
def create_visit_request(
    field_id: int,
    payload: VisitRequestCreate,
    db: Session = Depends(get_db),
) -> VisitRequestOut:
    field = _get_field_or_404(db, field_id)
    requester = _get_user_or_404(db, payload.requester_id)

    if field.owner_id == requester.id:
        raise HTTPException(status_code=400, detail="You cannot request a visit to your own field")

    existing = db.scalar(
        select(VisitRequest).where(
            VisitRequest.field_id == field.id,
            VisitRequest.requester_id == requester.id,
        )
    )
    if existing:
        return _visit_request_out(existing)

    request = VisitRequest(
        field_id=field.id,
        requester_id=requester.id,
        message=payload.message,
    )
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
    requests = list(
        db.scalars(
            select(VisitRequest)
            .where(VisitRequest.requester_id == requester_id)
            .order_by(VisitRequest.created_at.desc(), VisitRequest.id.desc())
        ).all()
    )
    return [_visit_request_out(request) for request in requests]


@router.put("/visit-requests/{request_id}", response_model=VisitRequestOut)
def update_visit_request(
    request_id: int,
    payload: VisitRequestStatusUpdate,
    db: Session = Depends(get_db),
) -> VisitRequestOut:
    request = db.get(VisitRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Visit request not found")
    if request.field.owner_id != payload.owner_id:
        raise HTTPException(status_code=403, detail="Only field owner can answer this request")

    request.status = payload.status
    db.commit()
    db.refresh(request)
    return _visit_request_out(request)


@router.get("/posts", response_model=list[PostOut])
def list_posts(db: Session = Depends(get_db)) -> list[PostOut]:
    posts = list(db.scalars(select(Post).order_by(Post.created_at.desc(), Post.id.desc())).all())
    return [
        PostOut(
            id=post.id,
            text=post.text,
            created_at=post.created_at,
            author=UserOut.model_validate(post.author),
        )
        for post in posts
    ]
