from datetime import datetime, timezone

from sqlalchemy import select

from .database import SessionLocal
from .models import Field, Post, User


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

        db.add_all([
            Field(owner_id=1, name="Северное поле", crop="Пшеница", latitude=54.9914, longitude=73.3645, area_ha=120),
            Field(owner_id=1, name="У пасеки", crop="Рапс", latitude=55.0350, longitude=73.2850, area_ha=48),
            Field(owner_id=2, name="Берёзовка", crop="Ячмень", latitude=55.0415, longitude=82.9346, area_ha=86),
            Field(owner_id=3, name="Тепличный участок", crop="Томаты", latitude=53.3474, longitude=83.7784, area_ha=12),
        ])

        now = datetime.now(timezone.utc)
        db.add_all([
            Post(author_id=2, text="После ночного дождя на части поля стоит вода. Кто как быстро оценивает риск для посевов?", created_at=now),
            Post(author_id=3, text="Пробуем новый режим проветривания теплиц. За неделю влажность стала заметно стабильнее.", created_at=now),
            Post(author_id=1, text="Есть ли у кого опыт ранней диагностики болезней листа по фото?", created_at=now),
        ])
        db.commit()
