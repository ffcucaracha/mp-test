# AgroConnect MVP — Implementation Plan

**Статус:** execution plan  
**Дата:** 2026-09-06  
**Основа:** `docs/SRS_LIGHT.md`, `docs/MVP_DECISIONS.md`

## 1. Цель плана

Собрать работоспособный мобильный MVP, который:

- закрывает обязательное ядро конкурса;
- проверяет основные продуктовые гипотезы;
- фиксирует продуктовые события;
- демонстрирует A/B-эксперимент приватности полей;
- позволяет пройти сквозной сценарий несколькими пользователями;
- запускается на Android.

Главный принцип: сначала стабильный end-to-end happy path, затем продуктовые усилители.

---

## 2. Порядок реализации

## Этап 0. Зафиксировать контракты и границы

Перед кодом:

- сверить `SRS_LIGHT.md` и `MVP_DECISIONS.md`;
- не добавлять новые фичи в P0 без осознанного изменения scope;
- определить минимальные API-контракты;
- определить минимальную схему данных;
- определить список продуктовых событий.

**Результат:** понятен набор сущностей, endpoint'ов и экранов.

---

## Этап 1. Привести текущий каркас к рабочему baseline

Backend:

- вынести модели из одного файла по модулям;
- добавить migrations;
- добавить seed-данные;
- проверить PostgreSQL;
- добавить единый формат ошибок;
- подготовить конфигурацию через `.env`.

Frontend:

- добавить роутинг;
- вынести API client;
- добавить store/context текущего пользователя;
- разнести текущие экраны по компонентам;
- проверить mobile layout.

Infra:

- `docker compose up --build`;
- проверить `/api/health`;
- проверить frontend → backend → PostgreSQL;
- собрать первый Capacitor APK spike.

**Критерий завершения:** приложение запускается локально и на Android, тестовый пользователь открывает ленту и профиль.

---

## Этап 2. Модель пользователя и профиль

Реализовать:

- редактирование профиля;
- регион;
- специализацию;
- название хозяйства;
- bio;
- `is_beekeeper`;
- настройки `news_radius_km` и `broadcast_radius_km`;
- вычисление полноты профиля.

API минимум:

```text
GET  /api/users
GET  /api/users/{id}
PATCH /api/users/{id}
```

События:

```text
profile_viewed
profile_updated
profile_completed
```

**Критерий завершения:** пользователь может заполнить профиль и изменить радиусы.

---

## Этап 3. Поля и география

Реализовать сущность `Field`.

Минимум:

```text
Field
- id
- owner_id
- name
- crop
- latitude
- longitude
- visibility_variant
- created_at
```

Функции:

- список моих полей;
- создание поля;
- редактирование;
- точка на карте;
- карточка поля.

API минимум:

```text
GET    /api/fields
POST   /api/fields
GET    /api/fields/{id}
PATCH  /api/fields/{id}
```

События:

```text
field_created
field_location_added
field_opened
```

**Критерий завершения:** два пользователя могут создать разные географически привязанные поля.

---

## Этап 4. A/B-приватность и «Попроситься в гости»

Назначить каждому пользователю экспериментальный вариант:

```text
A = public
B = controlled
```

Вариант сохранять стабильно для пользователя, а не генерировать при каждом открытии.

Реализовать:

- публичный просмотр поля для Variant A;
- ограниченный просмотр для Variant B;
- кнопку «Попроситься в гости»;
- запрос доступа;
- одобрение / отклонение владельцем;
- открытие деталей после approval.

Минимальная сущность:

```text
FieldVisitRequest
- id
- requester_id
- owner_id
- field_id
- status
- created_at
- resolved_at
```

API минимум:

```text
POST  /api/fields/{id}/visit-requests
GET   /api/visit-requests/incoming
PATCH /api/visit-requests/{id}
```

События:

```text
visit_request_sent
visit_request_approved
visit_request_rejected
private_field_viewed
public_field_viewed
```

**Критерий завершения:** можно показать оба варианта эксперимента на двух тестовых пользователях.

---

## Этап 5. Публикации и фото

Реализовать `Post`.

Минимум:

```text
Post
- id
- author_id
- field_id
- status
- text nullable
- image_url
- latitude
- longitude
- score
- created_at
```

Статусы:

```text
sowing
sprouting
flowering
problem
harvest
treatment
```

Функции:

- создание публикации;
- загрузка фото;
- привязка к полю;
- статус;
- отображение карточки публикации.

API минимум:

```text
POST /api/posts
GET  /api/posts/{id}
```

События:

```text
post_created
post_viewed
```

**Критерий завершения:** публикация одного пользователя видна другому.

---

## Этап 6. Лента, реакции и комментарии

Реализовать:

- локальную ленту;
- фильтрацию по `news_radius_km`;
- сортировку по свежести + score;
- реакцию «здоровый колосок» `+1`;
- реакцию «увядший колосок» `-1`;
- один голос пользователя на публикацию;
- текстовые комментарии.

Минимальные сущности:

```text
PostReaction
- user_id
- post_id
- value: 1 | -1

Comment
- id
- user_id
- post_id
- text
- created_at
```

API минимум:

```text
GET    /api/feed
PUT    /api/posts/{id}/reaction
DELETE /api/posts/{id}/reaction
GET    /api/posts/{id}/comments
POST   /api/posts/{id}/comments
```

События:

```text
feed_opened
post_viewed
reaction_added
reaction_changed
comment_created
```

**Критерий завершения:** полноценный social-core happy path работает между несколькими пользователями.

---

## Этап 7. Соседи

Реализовать явную связь `Neighbor`, не зависящую от расстояния.

Функции:

- добавить пользователя в соседи;
- удалить;
- список соседей;
- количество соседей в профиле.

API минимум:

```text
GET    /api/neighbors
POST   /api/neighbors/{user_id}
DELETE /api/neighbors/{user_id}
```

События:

```text
neighbor_added
neighbor_removed
neighbor_profile_opened
```

**Критерий завершения:** пользователь может сформировать собственную сеть контактов независимо от географии.

---

## Этап 8. Севооборот

Реализовать `CropSeason`.

```text
CropSeason
- id
- field_id
- year
- crop
```

Функции:

- история поля по годам;
- добавление записи;
- вывод истории в карточке поля.

API минимум:

```text
GET  /api/fields/{id}/crop-seasons
POST /api/fields/{id}/crop-seasons
```

События:

```text
crop_rotation_viewed
crop_rotation_added
```

**Критерий завершения:** у поля видна история минимум за несколько сезонов.

---

## Этап 9. Пасека и предупреждения о пестицидах

Реализовать признак `is_beekeeper` и сущность `Apiary`.

```text
Apiary
- id
- owner_id
- name
- latitude
- longitude
- alert_radius_km
```

Реализовать общий `Alert`:

```text
Alert
- id
- author_id
- field_id nullable
- type
- latitude
- longitude
- radius_km
- starts_at nullable
- payload JSON
- created_at
```

Типы MVP:

```text
disease
pesticide
weather
```

Для `pesticide`:

- владелец поля создаёт событие обработки;
- система определяет пользователей / пасеки в радиусе;
- создаёт получателям уведомления;
- в карточке доступен профиль владельца поля.

API минимум:

```text
POST /api/alerts
GET  /api/alerts
POST /api/apiaries
GET  /api/apiaries
```

События:

```text
apiary_created
alert_created
alert_received
alert_opened
owner_contact_opened
```

**Критерий завершения:** пчеловод получает предупреждение о тестовой обработке рядом с пасекой.

---

## Этап 10. Погода и заморозки

Выбрать один внешний weather API.

Реализовать сервис:

```text
coordinates → forecast → normalized risk
```

Для MVP достаточно одного правила заморозка, например риск при прогнозируемой температуре ниже заданного порога.

Не строить полноценную метеосистему.

Функции:

- запрос прогноза по координатам поля;
- создание weather alert;
- отображение предупреждения пользователю.

События:

```text
weather_checked
weather_alert_created
weather_alert_opened
```

**Критерий завершения:** можно продемонстрировать автоматическое погодное предупреждение для поля.

---

## Этап 11. Геймификация

Добавить только простые вычисляемые показатели:

- полнота профиля;
- количество соседей;
- серия недель активности;
- репутация по сумме реакций.

Не создавать сложную систему levels / badges.

События:

```text
streak_viewed
reputation_viewed
```

**Критерий завершения:** показатели видны в профиле и считаются из реальных данных.

---

## Этап 12. Product analytics / internal metrics

Реализовать универсальную таблицу событий:

```text
ProductEvent
- id
- event_name
- user_id nullable
- experiment_variant nullable
- properties JSON
- created_at
```

Сделать helper/service `track()` и не размазывать ручные INSERT по бизнес-коду.

Сделать `/internal/metrics`.

Минимальные блоки:

### Acquisition / activation

- пользователи;
- заполненные профили;
- созданные поля;
- поля с географией.

### Social

- публикации;
- просмотры;
- реакции;
- комментарии;
- соседи.

### Alerts

- созданные предупреждения;
- полученные;
- открытые;
- open rate;
- pesticide alerts;
- owner contact opens.

### Privacy experiment

Отдельно Variant A / B:

- field creation rate;
- location completion rate;
- crop rotation completion rate;
- visit requests;
- approval rate;
- detailed field views.

### ML

Если реализован:

- starts;
- shown results;
- accepted / rejected.

**Критерий завершения:** во время pitch можно открыть экран и показать реальные события тестовых пользователей.

---

## Этап 13. ML-распознавание фото

Делать только после стабильности P0/P1.

Предпочтительная реализация для MVP:

- внешний vision/LLM API либо готовая модель;
- ограниченный prompt / набор ожидаемых категорий;
- ответ в формате предварительной подсказки;
- обязательная возможность принять / отклонить.

UX:

```text
сделать фото
→ «Попробовать распознать»
→ «Похоже на ...»
→ подтвердить / исправить
→ создать публикацию со статусом «Проблема»
```

События:

```text
ml_started
ml_result_shown
ml_result_accepted
ml_result_rejected
post_created_after_ml
```

**Stop condition:** если интеграция начинает угрожать стабильности основного сценария — оставить mock или убрать из финальной сборки.

---

## Этап 14. Гипотеза-приманка

Добавить одну недоступную расширенную функцию, например:

> «Расширенная статистика хозяйства»

или

> «Полная история поля»

Логировать:

```text
premium_teaser_shown
premium_teaser_clicked
```

После клика достаточно понятного сообщения «Функция в разработке».

---

## Этап 15. Android и offline-risk testing

Не оставлять упаковку приложения на последний день.

Проверить:

- Capacitor sync;
- Android build;
- сетевой доступ к backend с физического устройства;
- camera/photo picker;
- карту;
- safe-area;
- крупные кнопки;
- читаемость на улице;
- поведение при медленной сети;
- понятную ошибку при отсутствии backend.

**Критерий завершения:** APK устанавливается на чистое Android-устройство и проходит основной сценарий.

---

## Этап 16. Seed/demo data

Подготовить 4–6 пользователей и несколько хозяйств так, чтобы демонстрация была содержательной.

Обязательно иметь:

- растениевода;
- пользователя с пасекой;
- несколько полей в разных расстояниях;
- севооборот за 2–3 года;
- публикации разных статусов;
- положительные и отрицательные реакции;
- комментарии;
- pesticide alert;
- weather alert;
- пользователей Variant A и Variant B;
- pending / approved visit request.

Не использовать случайный бессвязный lorem ipsum.

---

## Этап 17. Финальный QA и code freeze

Пройти сценарий вручную минимум на двух аккаунтах.

Проверить:

1. профиль;
2. поля;
3. географию;
4. приватность;
5. «Попроситься в гости»;
6. создание публикации;
7. ленту;
8. реакции;
9. комментарии;
10. соседей;
11. севооборот;
12. пасеку;
13. pesticide alert;
14. weather alert;
15. метрики;
16. Android APK.

После этого — code freeze. Исправлять только blocker/critical bugs.

---

## Этап 18. Материалы на сдачу

Подготовить:

- APK;
- 2-минутное видео;
- страницу с выводами по гипотезам;
- pitch на несколько минут;
- backup screen recording на случай проблем с сетью.

В видео показывать не перечень экранов, а сквозной сценарий:

```text
фермер → поле → публикация проблемы → реакция соседей
→ предупреждение → пчеловод → связь с владельцем
→ приватность / «попроситься в гости» → metrics
```

---

## 3. Рекомендуемый порядок по критичности

```text
P0:
baseline
→ profile
→ fields + geo
→ privacy A/B
→ posts + photo
→ feed
→ reactions/comments
→ event logging
→ metrics
→ Android build

P1:
neighbors
→ crop rotation
→ alerts core
→ apiary/pesticides
→ weather/frost
→ gamification

P2:
ML
→ own statistics
→ field polygon
→ map feed
→ polish
```

---

## 4. Правило отсечения scope

Если срок начинает поджимать, вырезать в таком порядке:

1. расширенная статистика пользователя;
2. полигон поля;
3. декоративная геймификация;
4. ML заменить mock-ответом;
5. расширенный weather UI;
6. дополнительные типы alert.

Не вырезать:

- профиль;
- поля и географию;
- публикации;
- ленту;
- реакции и комментарии;
- A/B-приватность;
- event logging;
- метрики;
- Android build.

---

## 5. Definition of Done

MVP готов, когда жюри может установить приложение и без пояснений пройти основной путь, а команда может показать не только функции, но и данные для проверки заявленных гипотез.
