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
    FarmAccessRequest,
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


def _demo_field(field_id: int, owner_id: int, name: str, crop: str, latitude: float, longitude: float, area_ha: float) -> Field:
    delta = 0.008
    return Field(
        id=field_id, owner_id=owner_id, name=name, crop=crop, rotation="", latitude=latitude, longitude=longitude, area_ha=area_ha,
        geometry={
            "type": "Polygon",
            "coordinates": [[
                [longitude - delta, latitude - delta], [longitude + delta, latitude - delta],
                [longitude + delta, latitude + delta], [longitude - delta, latitude + delta],
                [longitude - delta, latitude - delta],
            ]],
        },
        privacy_variant="B",
    )


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
            User(id=1, name="Анна Иванова", username="anna_farm", region="Республика Татарстан", specialization="Растениеводство", farm_name="Иваново Агро", bio="Пшеница, рапс и точное земледелие. Веду историю полей и слежу за рисками рядом.", news_radius_km=100, broadcast_radius_km=100),
            User(id=2, name="Ильдар Хабибуллин", username="ilya_field", region="Республика Татарстан", specialization="Растениеводство", farm_name="Хабибуллин кырлары", bio="Зерновые, масличные, обработка полей и обмен практикой с соседями.", news_radius_km=50, broadcast_radius_km=50),
            User(id=3, name="Лейсан Сафина", username="marina_agro", region="Республика Татарстан", specialization="Растениеводство", farm_name="Сафин Агро", bio="Работаю с полевыми культурами. Фиксирую состояние участков и историю по сезонам.", news_radius_km=100, broadcast_radius_km=50),
            User(id=4, name="Сергей Котов", username="kotov_agro", region="Республика Татарстан", specialization="Кормовые культуры", farm_name="Котов Агро", bio="Кормовые культуры, техника и экономика небольшого хозяйства.", news_radius_km=100, broadcast_radius_km=100),
            User(id=5, name="Ольга Лебедева", username="olga_bee", region="Республика Татарстан", specialization="Растениеводство и пчеловодство", farm_name="Лебедевы поля и пасека", bio="Выращиваем культуры и держим пасеку. Нужны своевременные предупреждения об обработках.", is_beekeeper=True, news_radius_km=100, broadcast_radius_km=100),
            User(id=6, name="Павел Орлов", username="orlov_far", region="Республика Татарстан", specialization="Кормовые культуры", farm_name="Орлов Поля", bio="Небольшое удалённое хозяйство с кормовыми культурами — полезно видеть только действительно локальные события.", news_radius_km=50, broadcast_radius_km=100),
            User(id=7, name="Егор Ковалёв", username="egor_lubino", region="Омская область, Любинский район", specialization="Зерновые культуры", farm_name="Ковалёвское", bio="Пшеница и ячмень. Работаем в Любинском районе.", news_radius_km=100, broadcast_radius_km=50),
            User(id=8, name="Наталья Ершова", username="natalia_lubino", region="Омская область, Любинский район", specialization="Растениеводство", farm_name="Ершова Агро", bio="Масличные и севооборот на небольшом хозяйстве.", news_radius_km=100, broadcast_radius_km=50),
            User(id=9, name="Денис Белов", username="denis_lubino", region="Омская область, Любинский район", specialization="Кормовые культуры", farm_name="Луговое", bio="Кормовые культуры и сенокосы Любинского района.", news_radius_km=100, broadcast_radius_km=100),
            User(id=10, name="Виктория Громова", username="vika_lubino", region="Омская область, Любинский район", specialization="Зерновые культуры", farm_name="Сибирский колос", bio="Полевой дневник, пшеница и рапс.", news_radius_km=100, broadcast_radius_km=50),
            User(id=11, name="Алексей Пчёлкин", username="alexey_bee_omsk", region="Омская область, Любинский район", specialization="Пчеловодство", farm_name="Любинская пасека", bio="Кочевая пасека и опыление полевых культур. Важны предупреждения об обработках.", is_beekeeper=True, news_radius_km=100, broadcast_radius_km=100),
        ]
        for user, field_access_mode in zip(users, ("B", "B", "A", "A", "B", "A", "B", "A", "B", "A", "B"), strict=True):
            user.field_access_mode = field_access_mode
        db.add_all(users)
        db.flush()

        # All 52 real polygons and 2026 crops are taken from the KML supplied for the hackathon.
        # Ownership is grouped geographically, so every user's fields form one compact farm.
        fields = [
            Field(rotation="", **{**item, "privacy_variant": users[item["owner_id"] - 1].field_access_mode})
            for item in SEED_FIELDS
        ]
        fields.extend([
            _demo_field(53, 7, "Любинское-1", "Пшеница яровая", 55.160, 72.695, 87.0),
            _demo_field(54, 8, "Берёзовое", "Рапс", 55.185, 72.730, 64.0),
            _demo_field(55, 9, "Луговой клин", "Люцерна", 55.135, 72.745, 51.0),
            _demo_field(56, 10, "Сибирский колос", "Ячмень", 55.205, 72.680, 93.0),
            _demo_field(57, 11, "Медоносный участок", "Фацелия", 55.175, 72.710, 18.0),
        ])
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

        apiary = Apiary(
            owner_id=5,
            name=f"Пасека у поля {fields[5].name}",
            latitude=(fields[2].latitude + fields[5].latitude) / 2,
            longitude=(fields[2].longitude + fields[5].longitude) / 2,
            alert_radius_km=50,
        )
        omsk_apiary = Apiary(owner_id=11, name="Любинская пасека", latitude=55.174, longitude=72.712, alert_radius_km=50)
        db.add_all([apiary, omsk_apiary])
        db.flush()

        now = datetime.now(timezone.utc)
        posts = [
            Post(id=1, author_id=1, field_id=1, text="На нижних листьях появились пятна. У кого было похожее?", status="problem", photo_data_url=_photo("Пятна на пшенице", "#d9d7a4"), latitude=fields[0].latitude, longitude=fields[0].longitude, created_at=now - timedelta(hours=2)),
            Post(id=2, author_id=1, field_id=2, text="Рапс вошёл в цветение. Опылители уже активно работают.", status="flowering", photo_data_url=_photo("Цветение рапса", "#e8df78"), latitude=fields[1].latitude, longitude=fields[1].longitude, created_at=now - timedelta(days=1)),
            Post(id=3, author_id=2, field_id=3, text="После ночного дождя часть поля переувлажнена, но рапс развивается ровно.", status="sprouts", photo_data_url=_photo("Рапс после дождя", "#afd08c"), latitude=fields[2].latitude, longitude=fields[2].longitude, created_at=now - timedelta(hours=6)),
            Post(id=4, author_id=3, field_id=4, text="Проверили участок пара: сорняки локально пошли второй волной, отмечаю перед обработкой.", status="problem", photo_data_url=_photo("Участок пара", "#c6b58a"), latitude=fields[3].latitude, longitude=fields[3].longitude, created_at=now - timedelta(hours=10)),
            Post(id=5, author_id=4, field_id=5, text="Закончили посев кукурузы на корм. Проверяем глубину и равномерность.", status="sowing", photo_data_url=_photo("Посев кукурузы", "#cbb889"), latitude=fields[4].latitude, longitude=fields[4].longitude, created_at=now - timedelta(days=2)),
            Post(id=6, author_id=2, field_id=3, text="Плановая обработка после обследования поля. Соседние пасеки предупреждены заранее.", status="treatment", photo_data_url=_photo("Обработка поля", "#b9c4a9"), latitude=fields[2].latitude, longitude=fields[2].longitude, created_at=now - timedelta(hours=1)),
            Post(id=7, author_id=5, field_id=6, text="Рапс набирает цвет. На пасеке рядом продолжаем следить за обработками соседей.", status="flowering", photo_data_url=_photo("Рапс и пасека", "#d8d3ef"), latitude=fields[5].latitude, longitude=fields[5].longitude, created_at=now - timedelta(hours=4)),
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
            FarmAccessRequest(owner_id=1, requester_id=2, message="Хотел бы посмотреть все поля хозяйства и обменяться опытом.", status="pending"),
            FarmAccessRequest(owner_id=2, requester_id=1, message="Можно посмотреть все поля перед поездкой?", status="approved"),
        ])
        db.flush()

        pesticide_alert = Alert(author_id=2, field_id=3, type="pesticide", latitude=fields[2].latitude, longitude=fields[2].longitude, radius_km=50, starts_at=now + timedelta(hours=18), payload={"title": f"Плановая обработка поля {fields[2].name}", "details": "Обработка запланирована на завтра утром. Просьба владельцам пасек поблизости принять меры."}, created_at=now - timedelta(minutes=30))
        weather_alert = Alert(author_id=1, field_id=1, type="weather", latitude=fields[0].latitude, longitude=fields[0].longitude, radius_km=1, starts_at=now + timedelta(hours=10), payload={"title": f"Риск заморозка на поле {fields[0].name}", "details": "Ночью температура может опуститься ниже 0 °C. Проверьте уязвимые участки.", "min_temperature_c": -1.8, "provider": "demo-seed"}, created_at=now - timedelta(minutes=20))
        db.add_all([pesticide_alert, weather_alert])
        db.flush()

        db.add_all([
            AlertRecipient(alert_id=pesticide_alert.id, user_id=5, apiary_id=apiary.id, distance_km=0.4),
            AlertRecipient(alert_id=weather_alert.id, user_id=1, apiary_id=None, distance_km=0.0),
        ])
        db.flush()

        for table_name in ("users", "fields", "posts", "crop_seasons", "apiaries"):
            _sync_sequence(db, table_name)

        db.commit()
