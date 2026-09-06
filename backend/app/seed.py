from datetime import datetime, timezone
from urllib.parse import quote

from sqlalchemy import select, text

from .database import SessionLocal
from .models import Comment, Field, Post, Reaction, User


def _photo(label: str, color: str) -> str:
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600">'
        f'<rect width="100%" height="100%" fill="{color}"/>'
        '<path d="M0 430 C180 350 280 500 470 410 C650 320 740 410 900 350 V600 H0Z" fill="#6b8f5b"/>'
        f'<text x="50%" y="42%" dominant-baseline="middle" text-anchor="middle" font-size="42" fill="#17351d" font-family="sans-serif">{label}</text>'
        '</svg>'
    )
    return f"data:image/svg+xml,{quote(svg)}"


def _sync_sequence(db, table_name: str) -> None:
    db.execute(
        text(
            f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), "
            f"COALESCE((SELECT MAX(id) FROM {table_name}), 1), true)"
        )
    )


def seed_data() -> None:
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)) is not None:
            return

        users = [
            User(id=1, name="Анна Морозова", username="anna_farm", region="Омская область", specialization="Растениеводство", farm_name="Морозово Агро", bio="Пшеница, ячмень и точное земледелие.", is_beekeeper=True, news_radius_km=100, broadcast_radius_km=100),
            User(id=2, name="Илья Соколов", username="ilya_field", region="Новосибирская область", specialization="Растениеводство", farm_name="Соколовские поля", bio="Практичные решения для полевых задач.", news_radius_km=50, broadcast_radius_km=100),
            User(id=3, name="Марина Белова", username="marina_agro", region="Алтайский край", specialization="Овощеводство", farm_name="Белова Ферма", bio="Овощи, теплицы и обмен опытом.", news_radius_km=200, broadcast_radius_km=100),
            User(id=4, name="Сергей Котов", username="kotov_agro", region="Тюменская область", specialization="Растениеводство", farm_name="Котов Агро", bio="Корма, автоматизация и экономика хозяйства.", news_radius_km=100, broadcast_radius_km=200),
        ]
        db.add_all(users)
        db.flush()

        fields = [
            Field(id=1, owner_id=1, name="Северное поле", crop="Пшеница", rotation="Пар → пшеница → рапс", latitude=54.9914, longitude=73.3645, area_ha=120, privacy_variant="A"),
            Field(id=2, owner_id=1, name="У пасеки", crop="Рапс", rotation="Пшеница → рапс → ячмень", latitude=55.0350, longitude=73.2850, area_ha=48, privacy_variant="B"),
            Field(id=3, owner_id=2, name="Берёзовка", crop="Ячмень", rotation="Пшеница → ячмень → горох", latitude=55.0415, longitude=82.9346, area_ha=86, privacy_variant="B"),
            Field(id=4, owner_id=3, name="Тепличный участок", crop="Томаты", rotation="Томаты → сидераты → огурцы", latitude=53.3474, longitude=83.7784, area_ha=12, privacy_variant="A"),
        ]
        db.add_all(fields)
        db.flush()

        now = datetime.now(timezone.utc)
        posts = [
            Post(id=1, author_id=1, field_id=1, text="На нижних листьях появились пятна. У кого было похожее?", status="problem", photo_data_url=_photo("Пятна на пшенице", "#d9d7a4"), latitude=fields[0].latitude, longitude=fields[0].longitude, created_at=now),
            Post(id=2, author_id=1, field_id=2, text="Рапс вошёл в цветение. Пчёлы уже активно работают.", status="flowering", photo_data_url=_photo("Цветение рапса", "#e8df78"), latitude=fields[1].latitude, longitude=fields[1].longitude, created_at=now),
            Post(id=3, author_id=2, field_id=3, text="После ночного дождя часть поля переувлажнена. Наблюдаем всходы.", status="sprouts", photo_data_url=_photo("Всходы ячменя", "#afd08c"), latitude=fields[2].latitude, longitude=fields[2].longitude, created_at=now),
            Post(id=4, author_id=3, field_id=4, text="Первая партия томатов почти готова к сбору.", status="harvest", photo_data_url=_photo("Томаты", "#d99171"), latitude=fields[3].latitude, longitude=fields[3].longitude, created_at=now),
        ]
        db.add_all(posts)
        db.flush()

        db.add_all([
            Reaction(post_id=1, user_id=2, value=-1),
            Reaction(post_id=1, user_id=3, value=-1),
            Reaction(post_id=2, user_id=2, value=1),
            Reaction(post_id=2, user_id=3, value=1),
            Reaction(post_id=3, user_id=1, value=1),
            Comment(post_id=1, author_id=2, text="Похоже на грибковую историю. Я бы посмотрел нижнюю сторону листа."),
            Comment(post_id=1, author_id=3, text="Если после дождей усиливается, лучше не затягивать с осмотром."),
        ])
        db.flush()

        # Explicit IDs keep demo data deterministic, so advance PostgreSQL sequences
        # before API-created rows start using autoincrement IDs.
        for table_name in ("users", "fields", "posts"):
            _sync_sequence(db, table_name)

        db.commit()
