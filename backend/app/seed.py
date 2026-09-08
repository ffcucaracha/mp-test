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
            User(
                id=1,
                name="Анна Морозова",
                username="anna_farm",
                region="Омская область · Омский район",
                specialization="Растениеводство",
                farm_name="Морозово Агро",
                bio="Пшеница, рапс и точное земледелие. Веду историю полей и слежу за рисками рядом.",
                news_radius_km=100,
                broadcast_radius_km=100,
            ),
            User(
                id=2,
                name="Илья Соколов",
                username="ilya_field",
                region="Омская область · Кормиловский район",
                specialization="Растениеводство",
                farm_name="Соколовские поля",
                bio="Ячмень, пшеница, обработка полей и обмен практикой с соседями.",
                news_radius_km=50,
                broadcast_radius_km=50,
            ),
            User(
                id=3,
                name="Марина Белова",
                username="marina_agro",
                region="Омская область · Азовский район",
                specialization="Овощеводство",
                farm_name="Белова Ферма",
                bio="Томаты и овощи открытого грунта. Фиксирую урожай и проблемы по сезонам.",
                news_radius_km=100,
                broadcast_radius_km=50,
            ),
            User(
                id=4,
                name="Сергей Котов",
                username="kotov_agro",
                region="Омская область · Любинский район",
                specialization="Кормовые культуры",
                farm_name="Котов Агро",
                bio="Кормовые культуры, техника и экономика небольшого хозяйства.",
                news_radius_km=100,
                broadcast_radius_km=100,
            ),
            User(
                id=5,
                name="Ольга Лебедева",
                username="olga_bee",
                region="Омская область · Кормиловский район",
                specialization="Растениеводство и пчеловодство",
                farm_name="Лебедевы поля и пасека",
                bio="Выращиваем гречиху и держим пасеку. Нужны своевременные предупреждения об обработках.",
                is_beekeeper=True,
                news_radius_km=100,
                broadcast_radius_km=100,
            ),
            User(
                id=6,
                name="Павел Орлов",
                username="orlov_far",
                region="Омская область · Большереченский район",
                specialization="Зерновые",
                farm_name="Орлов Север",
                bio="Хозяйство дальше от города — полезно видеть только действительно локальные события.",
                news_radius_km=50,
                broadcast_radius_km=100,
            ),
        ]
        db.add_all(users)
        db.flush()

        fields = [
            Field(id=1, owner_id=1, name="Северное поле", crop="Пшеница", rotation="", latitude=54.9914, longitude=73.3645, area_ha=120, privacy_variant="A"),
            Field(id=2, owner_id=1, name="Рапсовое у Иртыша", crop="Рапс", rotation="", latitude=55.0350, longitude=73.2850, area_ha=48, privacy_variant="B"),
            Field(id=3, owner_id=2, name="Берёзовка", crop="Ячмень", rotation="", latitude=55.1030, longitude=73.5200, area_ha=86, privacy_variant="B"),
            Field(id=4, owner_id=3, name="Южный овощной", crop="Томаты", rotation="", latitude=54.8300, longitude=73.4700, area_ha=12, privacy_variant="A"),
            Field(id=5, owner_id=4, name="Любино кормовое", crop="Кукуруза", rotation="", latitude=55.1700, longitude=72.7600, area_ha=74, privacy_variant="A"),
            Field(id=6, owner_id=5, name="Медовая гречиха", crop="Гречиха", rotation="", latitude=55.1120, longitude=73.5000, area_ha=32, privacy_variant="B"),
            Field(id=7, owner_id=6, name="Северный клин", crop="Овёс", rotation="", latitude=56.0800, longitude=74.0300, area_ha=140, privacy_variant="A"),
        ]
        db.add_all(fields)
        db.flush()

        db.add_all([
            CropSeason(field_id=1, year=2024, crop="Пар"),
            CropSeason(field_id=1, year=2025, crop="Рапс"),
            CropSeason(field_id=1, year=2026, crop="Пшеница"),
            CropSeason(field_id=2, year=2024, crop="Пшеница"),
            CropSeason(field_id=2, year=2025, crop="Ячмень"),
            CropSeason(field_id=2, year=2026, crop="Рапс"),
            CropSeason(field_id=3, year=2024, crop="Рапс"),
            CropSeason(field_id=3, year=2025, crop="Пшеница"),
            CropSeason(field_id=3, year=2026, crop="Ячмень"),
            CropSeason(field_id=4, year=2025, crop="Огурцы"),
            CropSeason(field_id=4, year=2026, crop="Томаты"),
            CropSeason(field_id=5, year=2024, crop="Люцерна"),
            CropSeason(field_id=5, year=2025, crop="Ячмень"),
            CropSeason(field_id=5, year=2026, crop="Кукуруза"),
            CropSeason(field_id=6, year=2024, crop="Фацелия"),
            CropSeason(field_id=6, year=2025, crop="Пшеница"),
            CropSeason(field_id=6, year=2026, crop="Гречиха"),
        ])

        apiary = Apiary(
            owner_id=5,
            name="Пасека у Медовой гречихи",
            latitude=55.1080,
            longitude=73.5050,
            alert_radius_km=50,
        )
        db.add(apiary)
        db.flush()

        now = datetime.now(timezone.utc)
        posts = [
            Post(id=1, author_id=1, field_id=1, text="На нижних листьях появились пятна. У кого было похожее?", status="problem", photo_data_url=_photo("Пятна на пшенице", "#d9d7a4"), latitude=fields[0].latitude, longitude=fields[0].longitude, created_at=now - timedelta(hours=2)),
            Post(id=2, author_id=1, field_id=2, text="Рапс вошёл в цветение. Опылители уже активно работают.", status="flowering", photo_data_url=_photo("Цветение рапса", "#e8df78"), latitude=fields[1].latitude, longitude=fields[1].longitude, created_at=now - timedelta(days=1)),
            Post(id=3, author_id=2, field_id=3, text="После ночного дождя часть поля переувлажнена, но всходы ровные.", status="sprouts", photo_data_url=_photo("Всходы ячменя", "#afd08c"), latitude=fields[2].latitude, longitude=fields[2].longitude, created_at=now - timedelta(hours=6)),
            Post(id=4, author_id=3, field_id=4, text="Первая партия томатов готова к сбору. Качество лучше прошлогоднего.", status="harvest", photo_data_url=_photo("Урожай томатов", "#d99171"), latitude=fields[3].latitude, longitude=fields[3].longitude, created_at=now - timedelta(hours=10)),
            Post(id=5, author_id=4, field_id=5, text="Закончили посев кукурузы на корм. Проверяем глубину и равномерность.", status="sowing", photo_data_url=_photo("Посев кукурузы", "#cbb889"), latitude=fields[4].latitude, longitude=fields[4].longitude, created_at=now - timedelta(days=2)),
            Post(id=6, author_id=2, field_id=3, text="Плановая обработка после обследования поля. Соседние пасеки предупреждены заранее.", status="treatment", photo_data_url=_photo("Обработка поля", "#b9c4a9"), latitude=fields[2].latitude, longitude=fields[2].longitude, created_at=now - timedelta(hours=1)),
            Post(id=7, author_id=5, field_id=6, text="Гречиха набирает цвет. Для пасеки начинается главный рабочий период.", status="flowering", photo_data_url=_photo("Гречиха и пасека", "#d8d3ef"), latitude=fields[5].latitude, longitude=fields[5].longitude, created_at=now - timedelta(hours=4)),
        ]
        db.add_all(posts)
        db.flush()

        db.add_all([
            Reaction(post_id=1, user_id=2, value=-1),
            Reaction(post_id=1, user_id=3, value=-1),
            Reaction(post_id=1, user_id=5, value=-1),
            Reaction(post_id=2, user_id=2, value=1),
            Reaction(post_id=2, user_id=5, value=1),
            Reaction(post_id=3, user_id=1, value=1),
            Reaction(post_id=3, user_id=4, value=1),
            Reaction(post_id=4, user_id=1, value=1),
            Reaction(post_id=5, user_id=2, value=1),
            Reaction(post_id=6, user_id=5, value=1),
            Reaction(post_id=7, user_id=1, value=1),
            Comment(post_id=1, author_id=2, text="Похоже на грибковую историю. Я бы посмотрел нижнюю сторону листа и динамику после росы."),
            Comment(post_id=1, author_id=3, text="Если после дождей усиливается, лучше не затягивать с осмотром и фото крупным планом."),
            Comment(post_id=2, author_id=5, text="Мы рядом. На пасеке уже заметно движение на рапс."),
            Comment(post_id=6, author_id=5, text="Предупреждение получили, спасибо. Ульи закроем на время обработки."),
            Neighbor(user_id=1, neighbor_user_id=2),
            Neighbor(user_id=1, neighbor_user_id=5),
            Neighbor(user_id=2, neighbor_user_id=1),
            Neighbor(user_id=2, neighbor_user_id=5),
            Neighbor(user_id=5, neighbor_user_id=1),
            Neighbor(user_id=5, neighbor_user_id=2),
            VisitRequest(field_id=2, requester_id=2, message="Хотел бы посмотреть схему рапсового поля и обменяться опытом.", status="pending"),
            VisitRequest(field_id=3, requester_id=3, message="Можно посмотреть детали поля перед поездкой в район?", status="approved"),
        ])
        db.flush()

        pesticide_alert = Alert(
            author_id=2,
            field_id=3,
            type="pesticide",
            latitude=fields[2].latitude,
            longitude=fields[2].longitude,
            radius_km=50,
            starts_at=now + timedelta(hours=18),
            payload={
                "title": "Плановая обработка поля Берёзовка",
                "details": "Обработка запланирована на завтра утром. Просьба владельцам пасек поблизости принять меры.",
            },
            created_at=now - timedelta(minutes=30),
        )
        weather_alert = Alert(
            author_id=1,
            field_id=1,
            type="weather",
            latitude=fields[0].latitude,
            longitude=fields[0].longitude,
            radius_km=1,
            starts_at=now + timedelta(hours=10),
            payload={
                "title": "Риск заморозка на Северном поле",
                "details": "Ночью температура может опуститься ниже 0 °C. Проверьте уязвимые участки.",
                "min_temperature_c": -1.8,
                "provider": "demo-seed",
            },
            created_at=now - timedelta(minutes=20),
        )
        db.add_all([pesticide_alert, weather_alert])
        db.flush()

        db.add_all([
            AlertRecipient(
                alert_id=pesticide_alert.id,
                user_id=5,
                apiary_id=apiary.id,
                distance_km=0.9,
            ),
            AlertRecipient(
                alert_id=weather_alert.id,
                user_id=1,
                apiary_id=None,
                distance_km=0.0,
            ),
        ])
        db.flush()

        for table_name in ("users", "fields", "posts", "crop_seasons", "apiaries"):
            _sync_sequence(db, table_name)

        db.commit()
