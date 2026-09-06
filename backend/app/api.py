from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import Field, Post, User
from .schemas import FieldCreate, FieldOut, PostOut, UserOut, UserUpdate

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "agroconnect-api"}


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)) -> list[User]:
    return list(db.scalars(select(User).order_by(User.id)).all())


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    for key, value in payload.model_dump().items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.get("/users/{user_id}/fields", response_model=list[FieldOut])
def list_user_fields(user_id: int, db: Session = Depends(get_db)) -> list[Field]:
    if not db.get(User, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return list(db.scalars(select(Field).where(Field.owner_id == user_id).order_by(Field.id)).all())


@router.post("/users/{user_id}/fields", response_model=FieldOut, status_code=status.HTTP_201_CREATED)
def create_field(user_id: int, payload: FieldCreate, db: Session = Depends(get_db)) -> Field:
    if not db.get(User, user_id):
        raise HTTPException(status_code=404, detail="User not found")

    field = Field(owner_id=user_id, **payload.model_dump())
    db.add(field)
    db.commit()
    db.refresh(field)
    return field


@router.get("/fields/{field_id}", response_model=FieldOut)
def get_field(field_id: int, db: Session = Depends(get_db)) -> Field:
    field = db.get(Field, field_id)
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    return field


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
