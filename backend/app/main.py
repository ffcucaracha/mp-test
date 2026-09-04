import os
from datetime import datetime, timezone
from typing import Generator

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from sqlalchemy import DateTime, ForeignKey, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://agroconnect:agroconnect@localhost:5432/agroconnect",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    location: Mapped[str] = mapped_column(String(160))
    farm: Mapped[str] = mapped_column(String(180))
    bio: Mapped[str] = mapped_column(Text)

    posts: Mapped[list["Post"]] = relationship(back_populates="author")


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    author: Mapped[User] = relationship(back_populates="posts")


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    username: str
    location: str
    farm: str
    bio: str


class PostOut(BaseModel):
    id: int
    text: str
    created_at: datetime
    author: UserOut


app = FastAPI(title="AgroConnect MVP API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def seed_data() -> None:
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)) is not None:
            return

        users = [
            User(
                id=1,
                name="Анна Морозова",
                username="anna_farm",
                location="Омская область",
                farm="Зерновое хозяйство · 420 га",
                bio="Пшеница, ячмень и немного экспериментов с точным земледелием.",
            ),
            User(
                id=2,
                name="Илья Соколов",
                username="ilya_field",
                location="Новосибирская область",
                farm="Растениеводство · 180 га",
                bio="Ищу практичные способы быстрее решать проблемы в поле.",
            ),
            User(
                id=3,
                name="Марина Белова",
                username="marina_agro",
                location="Алтайский край",
                farm="Семейная ферма · овощи и теплицы",
                bio="Тепличное хозяйство, овощи и обмен опытом без лишней теории.",
            ),
            User(
                id=4,
                name="Сергей Котов",
                username="kotov_agro",
                location="Тюменская область",
                farm="Молочная ферма · 140 голов",
                bio="Интересуюсь кормами, автоматизацией и экономикой хозяйства.",
            ),
        ]
        db.add_all(users)
        db.flush()

        now = datetime.now(timezone.utc)
        db.add_all(
            [
                Post(author_id=2, text="После ночного дождя на части поля стоит вода. Кто как быстро оценивает риск для посевов?", created_at=now),
                Post(author_id=3, text="Пробуем новый режим проветривания теплиц. За неделю влажность стала заметно стабильнее.", created_at=now),
                Post(author_id=1, text="Есть ли у кого опыт ранней диагностики болезней листа по фото? Думаю протестировать такой сценарий прямо в AgroConnect.", created_at=now),
                Post(author_id=4, text="Сравниваю два рациона по себестоимости литра молока. Интересно, какие показатели вы считаете ключевыми.", created_at=now),
            ]
        )
        db.commit()


@app.on_event("startup")
def startup() -> None:
    seed_data()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "agroconnect-api"}


@app.get("/api/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)) -> list[User]:
    return list(db.scalars(select(User).order_by(User.id)).all())


@app.get("/api/users/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.get("/api/posts", response_model=list[PostOut])
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
