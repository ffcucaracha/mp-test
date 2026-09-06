from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    region: Mapped[str] = mapped_column(String(160), default="")
    specialization: Mapped[str] = mapped_column(String(160), default="Растениеводство")
    farm_name: Mapped[str] = mapped_column(String(180), default="")
    bio: Mapped[str] = mapped_column(Text, default="")
    is_beekeeper: Mapped[bool] = mapped_column(Boolean, default=False)
    news_radius_km: Mapped[int] = mapped_column(Integer, default=100)
    broadcast_radius_km: Mapped[int] = mapped_column(Integer, default=100)

    posts: Mapped[list["Post"]] = relationship(back_populates="author", cascade="all, delete-orphan")
    fields: Mapped[list["Field"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    visit_requests: Mapped[list["VisitRequest"]] = relationship(
        back_populates="requester",
        cascade="all, delete-orphan",
        foreign_keys="VisitRequest.requester_id",
    )
    reactions: Mapped[list["Reaction"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    comments: Mapped[list["Comment"]] = relationship(back_populates="author", cascade="all, delete-orphan")


class Field(Base):
    __tablename__ = "fields"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    crop: Mapped[str] = mapped_column(String(120))
    rotation: Mapped[str] = mapped_column(Text, default="")
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    area_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    privacy_variant: Mapped[str] = mapped_column(String(1), default="A")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    owner: Mapped[User] = relationship(back_populates="fields")
    visit_requests: Mapped[list["VisitRequest"]] = relationship(back_populates="field", cascade="all, delete-orphan")
    posts: Mapped[list["Post"]] = relationship(back_populates="field", cascade="all, delete-orphan")


class VisitRequest(Base):
    __tablename__ = "visit_requests"
    __table_args__ = (UniqueConstraint("field_id", "requester_id", name="uq_visit_request_field_requester"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"), index=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    message: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    field: Mapped[Field] = relationship(back_populates="visit_requests")
    requester: Mapped[User] = relationship(back_populates="visit_requests", foreign_keys=[requester_id])


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(24), default="problem")
    photo_data_url: Mapped[str] = mapped_column(Text)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    author: Mapped[User] = relationship(back_populates="posts")
    field: Mapped[Field] = relationship(back_populates="posts")
    reactions: Mapped[list["Reaction"]] = relationship(back_populates="post", cascade="all, delete-orphan")
    comments: Mapped[list["Comment"]] = relationship(back_populates="post", cascade="all, delete-orphan")


class Reaction(Base):
    __tablename__ = "reactions"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_reaction_post_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    value: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    post: Mapped[Post] = relationship(back_populates="reactions")
    user: Mapped[User] = relationship(back_populates="reactions")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    post: Mapped[Post] = relationship(back_populates="comments")
    author: Mapped[User] = relationship(back_populates="comments")
