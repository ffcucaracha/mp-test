from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
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
        back_populates="requester", cascade="all, delete-orphan", foreign_keys="VisitRequest.requester_id"
    )
    reactions: Mapped[list["Reaction"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    comments: Mapped[list["Comment"]] = relationship(back_populates="author", cascade="all, delete-orphan")
    apiaries: Mapped[list["Apiary"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    alerts: Mapped[list["Alert"]] = relationship(back_populates="author", cascade="all, delete-orphan")
    alert_recipients: Mapped[list["AlertRecipient"]] = relationship(back_populates="user", cascade="all, delete-orphan")


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
    geometry: Mapped[dict] = mapped_column(JSON, nullable=False)
    privacy_variant: Mapped[str] = mapped_column(String(1), default="A")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    owner: Mapped[User] = relationship(back_populates="fields")
    visit_requests: Mapped[list["VisitRequest"]] = relationship(back_populates="field", cascade="all, delete-orphan")
    posts: Mapped[list["Post"]] = relationship(back_populates="field", cascade="all, delete-orphan")
    crop_seasons: Mapped[list["CropSeason"]] = relationship(back_populates="field", cascade="all, delete-orphan")
    alerts: Mapped[list["Alert"]] = relationship(back_populates="field")


class CropSeason(Base):
    __tablename__ = "crop_seasons"
    __table_args__ = (UniqueConstraint("field_id", "year", name="uq_crop_season_field_year"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"), index=True)
    year: Mapped[int] = mapped_column(Integer)
    crop: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    field: Mapped[Field] = relationship(back_populates="crop_seasons")


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


class Neighbor(Base):
    __tablename__ = "neighbors"
    __table_args__ = (UniqueConstraint("user_id", "neighbor_user_id", name="uq_neighbor_pair"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    neighbor_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Apiary(Base):
    __tablename__ = "apiaries"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    alert_radius_km: Mapped[int] = mapped_column(Integer, default=50)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    owner: Mapped[User] = relationship(back_populates="apiaries")
    alert_recipients: Mapped[list["AlertRecipient"]] = relationship(back_populates="apiary")


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    field_id: Mapped[int | None] = mapped_column(ForeignKey("fields.id", ondelete="SET NULL"), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(24), index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    radius_km: Mapped[int] = mapped_column(Integer)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    author: Mapped[User] = relationship(back_populates="alerts")
    field: Mapped[Field | None] = relationship(back_populates="alerts")
    recipients: Mapped[list["AlertRecipient"]] = relationship(back_populates="alert", cascade="all, delete-orphan")


class AlertRecipient(Base):
    __tablename__ = "alert_recipients"
    __table_args__ = (UniqueConstraint("alert_id", "user_id", "apiary_id", name="uq_alert_recipient_apiary"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    alert_id: Mapped[int] = mapped_column(ForeignKey("alerts.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    apiary_id: Mapped[int | None] = mapped_column(ForeignKey("apiaries.id", ondelete="SET NULL"), nullable=True, index=True)
    distance_km: Mapped[float] = mapped_column(Float)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    alert: Mapped[Alert] = relationship(back_populates="recipients")
    user: Mapped[User] = relationship(back_populates="alert_recipients")
    apiary: Mapped[Apiary | None] = relationship(back_populates="alert_recipients")


class ProductEvent(Base):
    __tablename__ = "product_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    event_name: Mapped[str] = mapped_column(String(80), index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    experiment_variant: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    properties: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class PlantHealthAnalysis(Base):
    __tablename__ = "plant_health_analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(32), index=True)
    crop_hint: Mapped[str] = mapped_column(String(120), default="")
    image_data_url: Mapped[str] = mapped_column(Text)
    image_sha256: Mapped[str] = mapped_column(String(64), index=True)
    predictions: Mapped[list] = mapped_column(JSON, default=list)
    top_label: Mapped[str] = mapped_column(String(240))
    top_confidence: Mapped[float] = mapped_column(Float)
    feedback_status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    final_label: Mapped[str | None] = mapped_column(String(240), nullable=True)
    posted_post_id: Mapped[int | None] = mapped_column(ForeignKey("posts.id", ondelete="SET NULL"), nullable=True, index=True)
    feedback_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
