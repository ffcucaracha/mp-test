from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from sqlalchemy import select, text

from .database import SessionLocal
from .models import (
    Alert,
    AlertRecipient,
    Apiary,
    Comment,
    CropSeason,
    Field,
    Neighbor,
    Post,
    Reaction,
    User,
    VisitRequest,
)
from .seed_fields import SEED_FIELDS


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
    """Create a deterministic, story-driven dataset for the hackathon demo."""
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)) is not None:
            return

        users = [
            User(id=1, name="Анна Морозова", username="anna_farm", region="Республика Татарстан", specialization="Растениеводство", farm_name="Морозово Агро", bio="Пшеница, рапс и точное земледелие. Веду историю полей и слежу за рисками рядом.", news_radius_km=100, broadcast_radius_km=100),
            User(id=2, name="Илья Соколов", username="ilya_field", region="Республика Татарстан", specialization="Растениеводство", farm_name="Соколовские поля", bio="Зерновые, масличные, обработка полей и обмен практикой с соседями.", news_radius_km=50, broadcast_radius_km=50),
            User(id=3, name="Марина Белова", username="marina_agro", region="Республика Татарстан", specialization="Растениеводство", farm_name="Белова Ферма", bio="Работаю с полевыми культурами. Фиксирую состояние участков и историю по сезонам.", news_radius_km=100, broadcast_radius_km=50),
            User(id=4, name="Сергей Котов", username="kotov_agro", region="Республика Татарстан", specialization="Кормовые культуры", farm_name="Котов Агро", bio="Кормовые культуры, техника и экономика небольшого хозяйства.", news_radius_km=100, broadcast_radius_km=100),
            User(id=5, name="Ольга Лебедева", username="olga_bee", region="Республика Татарстан", specialization="Растениеводство и пчеловодство", farm_name="Лебедевы поля и пасека", bio="Выращиваем культуры и держим пасеку. Нужны своевременные предупреждения об обработках.", is_beekeeper=True, news_radius_km=100, broadcast_radius_km=100),
            User(id=6, name="Павел Орлов", username="orlov_far", region="Республика Татарстан", specialization="Зерновые", farm_name="Орлов Поля", bio="Небольшое хозяйство — полезно видеть только действительно локальные события.", news_radius_km=50, broadcast_radius_km=100),
        ]
        db.add_all(users)
        db.flush()

        # Real polygons and 2026 crops are taken from the KML supplied for the hackathon.
        fields = [Field(rotation="", **item) for item in SEED_FIELDS]
        db.add_all(fields)
        db.flush()

        db.add_all([
            CropSeason(field_id=1, year=2024, crop="Пар"),
            CropSeason(field_id=1, year=2025, crop="Рапс"),
            CropSeason(field_id=1, year=2026, crop=fields[0].crop),
            CropSeason(field_id=2, year=2024, crop="Пшеница"),
            CropSeason(field_id=2, year=2025, crop="Ячмень"),
            CropSeason(field_id=2, year=2026, crop=fields[1].crop),
            CropSeason(field_id=3, year=2024, crop="Рапс"),
            CropSeason(field_id=3, year=2025, crop="Пшеница"),
            CropSeason(field_id=3, year=2026, crop=fields[2].crop),
            CropSeason(field_id=4, year=2025, crop="Пшеница"),
            CropSeason(field_id=4, year=2026, crop=fields[3].crop),
            CropSeason(field_id=5, year=2024, crop="Люцерна"),
            CropSeason(field_id=5, year=2025, crop="Ячмень"),
            CropSeason(field_id=5, year=2026, crop=fields[4].crop),
            CropSeason(field_id=6, year=2024, crop="Фацелия"),
            CropSeason(field_id=6, year=2025, crop="Пшеница"),
            CropSeason(field_id=6, year=2026, crop=fields[5].crop),
            *[CropSeason(field_id=field.id, year=2026, crop=field.crop) for field in fields[6:]],
        ])

        apiary = Apiary(owner_id=5, name="Пасека у поля № 37", latitude=55.6890, longitude=50.5410, alert_radius_km=50)
        db.add(apiary)
        db.flush()

        now = datetime.now(timezone.utc)
        posts = [
            Post(id=1, author_id=1, field_id=1, text="На нижних листьях появились пятна. У кого было похожее?", status="problem", photo_data_url=_photo("Пятна на пшенице", "#d9d7a4"), latitude=fields[0].latitude, longitude=fields[0].longitude, created_at=now - timedelta(hours=2)),
            Post(id=2, author_id=1, field_id=2, text="Подсолнечник вошёл в цветение. Опылители уже активно работают.", status="flowering", photo_data_url=_photo("Цветение подсолнечника", "#e8df78"), latitude=fields[1].latitude, longitude=fields[1].longitude, created_at=now - timedelta(days=1)),
            Post(id=3, author_id=2, field_id=3, text="После ночного дождя часть поля переувлажнена, но подсолнечник развивается ровно.", status="sprouts", photo_data_url=_photo("Подсолнечник после дождя", "#afd08c"), latitude=fields[2].latitude, longitude=fields[2].longitude, created_at=now - timedelta(hours=6)),
            Post(id=4, author_id=3, field_id=4, text="Проверили участок пара: сорняки локально пошли второй волной, отмечаю перед обработкой.", status="problem", photo_data_url=_photo("Участок пара", "#c6b58a"), latitude=fields[3].latitude, longitude=fields[3].longitude, created_at=now - timedelta(hours=10)),
            Post(id=5, author_id=4, field_id=5, text="Закончили посев кукурузы на корм. Проверяем глубину и равномерность.", status="sowing", photo_data_url=_photo("Посев кукурузы", "#cbb889"), latitude=fields[4].latitude, longitude=fields[4].longitude, created_at=now - timedelta(days=2)),
            Post(id=6, author_id=2, field_id=3, text="Плановая обработка после обследования поля. Соседние пасеки предупреждены заранее.", status="treatment", photo_data_url=_photo("Обработка поля", "#b9c4a9"), latitude=fields[2].latitude, longitude=fields[2].longitude, created_at=now - timedelta(hours=1)),
            Post(id=7, author_id=5, field_id=6, text="Кукуруза набирает массу. На пасеке рядом продолжаем следить за обработками соседей.", status="sprouts", photo_data_url=_photo("Кукуруза и пасека", "#d8d3ef"), latitude=fields[5].latitude, longitude=fields[5].longitude, created_at=now - timedelta(hours=4)),
        ]
        db.add_all(posts)
        db.flush()

        db.add_all([
            Reaction(post_id=1, user_id=2, value=-1), Reaction(post_id=1, user_id=3, value=-1), Reaction(post_id=1, user_id=5, value=-1),
            Reaction(post_id=2, user_id=2, value=1), Reaction(post_id=2, user_id=5, value=1), Reaction(post_id=3, user_id=1, value=1), Reaction(post_id=3, user_id=4, value=1), Reaction(post_id=4, user_id=1, value=1), Reaction(post_id=5, user_id=2, value=1), Reaction(post_id=6, user_id=5, value=1), Reaction(post_id=7, user_id=1, value=1),
            Comment(post_id=1, author_id=2, text="Похоже на грибковую историю. Я бы посмотрел нижнюю сторону листа и динамику после росы."),
            Comment(post_id=1, author_id=3, text="Если после дождей усиливается, лучше не затягивать с осмотром и фото крупным планом."),
            Comment(post_id=2, author_id=5, text="Мы рядом. На пасеке уже заметно движение во время цветения."),
            Comment(post_id=6, author_id=5, text="Предупреждение получили, спасибо. Ульи закроем на время обработки."),
            Neighbor(user_id=1, neighbor_user_id=2), Neighbor(user_id=1, neighbor_user_id=5), Neighbor(user_id=2, neighbor_user_id=1), Neighbor(user_id=2, neighbor_user_id=5), Neighbor(user_id=5, neighbor_user_id=1), Neighbor(user_id=5, neighbor_user_id=2),
            VisitRequest(field_id=2, requester_id=2, message="Хотел бы посмотреть детали поля и обменяться опытом.", status="pending"),
            VisitRequest(field_id=3, requester_id=3, message="Можно посмотреть детали поля перед поездкой?", status="approved"),
        ])
        db.flush()

        pesticide_alert = Alert(author_id=2, field_id=3, type="pesticide", latitude=fields[2].latitude, longitude=fields[2].longitude, radius_km=50, starts_at=now + timedelta(hours=18), payload={"title": f"Плановая обработка поля {fields[2].name}", "details": "Обработка запланирована на завтра утром. Просьба владельцам пасек поблизости принять меры."}, created_at=now - timedelta(minutes=30))
        weather_alert = Alert(author_id=1, field_id=1, type="weather", latitude=fields[0].latitude, longitude=fields[0].longitude, radius_km=1, starts_at=now + timedelta(hours=10), payload={"title": f"Риск заморозка на поле {fields[0].name}", "details": "Ночью температура может опуститься ниже 0 °C. Проверьте уязвимые участки.", "min_temperature_c": -1.8, "provider": "demo-seed"}, created_at=now - timedelta(minutes=20))
        db.add_all([pesticide_alert, weather_alert])
        db.flush()

        db.add_all([
            AlertRecipient(alert_id=pesticide_alert.id, user_id=5, apiary_id=apiary.id, distance_km=1.1),
            AlertRecipient(alert_id=weather_alert.id, user_id=1, apiary_id=None, distance_km=0.0),
        ])
        db.flush()

        for table_name in ("users", "fields", "posts", "crop_seasons", "apiaries"):
            _sync_sequence(db, table_name)

        db.commit()
