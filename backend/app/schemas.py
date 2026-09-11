from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field as PydanticField, model_validator

from .field_geometry import normalize_field_geometry

PostStatus = Literal["sowing", "sprouts", "flowering", "problem", "harvest", "treatment"]
AlertType = Literal["disease", "pesticide", "weather"]
FeedbackDiaryIntent = Literal["yes", "probably_yes", "probably_no", "no"]
FeedbackFeature = Literal["local_events", "field_history", "alerts", "neighbors", "plant_analysis"]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    username: str
    region: str
    specialization: str
    farm_name: str
    bio: str
    is_beekeeper: bool
    news_radius_km: int
    broadcast_radius_km: int


class UserUpdate(BaseModel):
    name: str = PydanticField(min_length=2, max_length=120)
    region: str = PydanticField(max_length=160)
    specialization: str = PydanticField(max_length=160)
    farm_name: str = PydanticField(max_length=180)
    bio: str = PydanticField(max_length=1000)
    is_beekeeper: bool = False
    news_radius_km: int = PydanticField(default=100, ge=1, le=500)
    broadcast_radius_km: int = PydanticField(default=100, ge=1, le=500)


class FieldCreate(BaseModel):
    name: str = PydanticField(min_length=1, max_length=120)
    crop: str = PydanticField(min_length=1, max_length=120)
    rotation: str = PydanticField(default="", max_length=1000)
    latitude: float = PydanticField(ge=-90, le=90)
    longitude: float = PydanticField(ge=-180, le=180)
    area_ha: float | None = PydanticField(default=None, gt=0)
    geometry: dict | None = None
    privacy_variant: Literal["A", "B"] = "A"

    @model_validator(mode="after")
    def normalize_geometry(self):
        geometry, latitude, longitude, area_ha = normalize_field_geometry(
            self.geometry,
            self.latitude,
            self.longitude,
            self.area_ha,
        )
        self.geometry = geometry
        self.latitude = latitude
        self.longitude = longitude
        self.area_ha = area_ha
        return self


class FieldOut(FieldCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    created_at: datetime


class FieldPrivacyUpdate(BaseModel):
    owner_id: int
    privacy_variant: Literal["A", "B"]


class PublicFieldOut(BaseModel):
    id: int
    owner_id: int
    owner_name: str
    owner_username: str
    owner_region: str
    privacy_variant: Literal["A", "B"]
    details_visible: bool
    name: str | None
    crop: str | None
    rotation: str | None
    area_ha: float | None
    latitude: float | None
    longitude: float | None
    geometry: dict | None = None
    approximate_latitude: float
    approximate_longitude: float
    visit_request_status: Literal["pending", "approved", "declined"] | None = None


class CropSeasonCreate(BaseModel):
    user_id: int
    year: int = PydanticField(ge=1990, le=2100)
    crop: str = PydanticField(min_length=1, max_length=120)


class CropSeasonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    field_id: int
    year: int
    crop: str
    created_at: datetime


class VisitRequestCreate(BaseModel):
    requester_id: int
    message: str = PydanticField(default="", max_length=500)


class VisitRequestStatusUpdate(BaseModel):
    owner_id: int
    status: Literal["approved", "declined"]


class VisitRequestOut(BaseModel):
    id: int
    field_id: int
    field_name: str
    owner_id: int
    requester_id: int
    requester_name: str
    requester_username: str
    message: str
    status: Literal["pending", "approved", "declined"]
    created_at: datetime


class CommentCreate(BaseModel):
    author_id: int
    text: str = PydanticField(min_length=1, max_length=1000)


class CommentOut(BaseModel):
    id: int
    author: UserOut
    text: str
    created_at: datetime


class ReactionSet(BaseModel):
    user_id: int
    value: Literal[-1, 1]


class PostCreate(BaseModel):
    author_id: int
    field_id: int
    text: str = PydanticField(default="", max_length=3000)
    status: PostStatus
    photo_data_url: str = PydanticField(min_length=10, max_length=4_500_000)
    latitude: float = PydanticField(ge=-90, le=90)
    longitude: float = PydanticField(ge=-180, le=180)


class FeedPostOut(BaseModel):
    id: int
    text: str
    status: PostStatus
    photo_data_url: str
    latitude: float
    longitude: float
    created_at: datetime
    author: UserOut
    field_id: int
    field_name: str
    crop: str
    distance_km: float | None
    healthy_count: int
    wilted_count: int
    score: int
    viewer_reaction: Literal[-1, 1] | None
    comments: list[CommentOut]


class NeighborOut(BaseModel):
    user: UserOut
    created_at: datetime


class ApiaryCreate(BaseModel):
    owner_id: int
    name: str = PydanticField(min_length=1, max_length=120)
    latitude: float = PydanticField(ge=-90, le=90)
    longitude: float = PydanticField(ge=-180, le=180)
    alert_radius_km: int = PydanticField(default=50, ge=1, le=500)


class ApiaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    name: str
    latitude: float
    longitude: float
    alert_radius_km: int
    created_at: datetime


class AlertCreate(BaseModel):
    author_id: int
    field_id: int | None = None
    type: AlertType
    latitude: float = PydanticField(ge=-90, le=90)
    longitude: float = PydanticField(ge=-180, le=180)
    radius_km: int = PydanticField(ge=1, le=500)
    starts_at: datetime | None = None
    title: str = PydanticField(min_length=1, max_length=180)
    details: str = PydanticField(default="", max_length=2000)


class AlertOut(BaseModel):
    id: int
    type: AlertType
    title: str
    details: str
    field_id: int | None
    field_name: str | None
    author: UserOut
    latitude: float
    longitude: float
    radius_km: int
    starts_at: datetime | None
    distance_km: float | None
    apiary_id: int | None
    apiary_name: str | None
    is_opened: bool
    created_at: datetime


class AlertOpen(BaseModel):
    user_id: int


class FeedbackCreate(BaseModel):
    rating: int = PydanticField(ge=1, le=5)
    liked_text: str = PydanticField(default="", max_length=2000)
    improvement_text: str = PydanticField(default="", max_length=2000)
    local_network_score: int = PydanticField(ge=1, le=5)
    field_diary_intent: FeedbackDiaryIntent
    alerts_score: int = PydanticField(ge=1, le=5)
    privacy_comfort_score: int = PydanticField(ge=1, le=5)
    most_valuable_feature: FeedbackFeature
    app_version: str = PydanticField(default="mvp", max_length=64)


class FeedbackOut(FeedbackCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    privacy_variant: Literal["A", "B"] | None = None
    created_at: datetime
