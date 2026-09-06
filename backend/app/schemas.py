from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field as PydanticField


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
    latitude: float = PydanticField(ge=-90, le=90)
    longitude: float = PydanticField(ge=-180, le=180)
    area_ha: float | None = PydanticField(default=None, gt=0)


class FieldOut(FieldCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    created_at: datetime


class PostOut(BaseModel):
    id: int
    text: str
    created_at: datetime
    author: UserOut
