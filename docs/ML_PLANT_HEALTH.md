# Этап 13 — AI-анализ здоровья растений и собственный датасет

## 1. Цель

Функция не должна выдавать пользователю «диагноз по фотографии». Её задача — быстро сформировать **предварительную гипотезу**, которую человек подтверждает, отклоняет или исправляет, а затем при желании превращает в публикацию о проблеме и локальное предупреждение соседям.

Основной пользовательский сценарий:

```text
Фото растения
    ↓
AI-анализ
    ↓
«Похоже на …» + confidence + альтернативы
    ↓
Пользователь: подтверждает / отклоняет / исправляет
    ↓
Подтверждённая проблема публикуется в ленте
    ↓
Опционально — предупреждение соседним хозяйствам
    ↓
Фото + предсказание + обратная связь сохраняются в датасет AgroConnect
```

Таким образом ML в AgroConnect — не автономный агроном, а **human-in-the-loop помощник** и одновременно механизм накопления собственных полевых данных.

---

## 2. Архитектура провайдеров

Backend не зависит от конкретного внешнего сервиса. Все реализации следуют интерфейсу:

```python
class PlantHealthProvider(ABC):
    @abstractmethod
    def analyze(
        self,
        image_data_url: str,
        crop_hint: str | None = None,
    ) -> PlantHealthResult:
        ...
```

Нормализованный результат:

```text
PlantHealthResult
├── provider
└── suggestions[]
    ├── label
    ├── confidence
    ├── scientific_name
    ├── category
    └── description
```

Бизнес-логика работает только с этим форматом. Поэтому можно менять поставщика модели без переписывания UI, датасета, публикаций и предупреждений.

Файл реализации: `backend/app/plant_health.py`.

Поддерживаются четыре провайдера:

| Провайдер | Режим | Для чего нужен | Ограничение |
|---|---|---|---|
| `kindwise` | внешний API | основной специализированный вариант crop.health | нужен API key и интернет |
| `gemini` | внешний API | альтернативный general-purpose vision/VLM | нужен API key и интернет, не специализирован на фитопатологии |
| `plantvillage` | локальная ONNX-модель | offline fallback и экспериментальная локальная классификация | ограничена классами и доменом PlantVillage |
| `demo` | локальный deterministic mock | CI, демонстрация без ключей и сети | не делает реального распознавания |

Выбранный по умолчанию провайдер задаётся через:

```env
PLANT_HEALTH_PROVIDER=kindwise
```

При этом frontend может явно передать другой провайдер для конкретного анализа. Это позволяет на одном и том же фото сравнивать crop.health, Gemini и локальную модель.

---

## 3. crop.health / Kindwise

Конфигурация:

```env
PLANT_HEALTH_PROVIDER=kindwise
CROP_HEALTH_API_KEY=...
CROP_HEALTH_API_URL=https://crop.kindwise.com/api/v1/identification
```

Backend передаёт изображение в crop.health и приводит его disease suggestions к общему `PlantHealthResult`.

Почему это основной кандидат для MVP:

- сервис специализирован на болезнях, вредителях и проблемах сельхозкультур;
- возвращает несколько кандидатов и probability;
- лучше соответствует задаче, чем универсальная vision-модель;
- не требует от команды хакатона обучать и обслуживать собственную модель до появления собственных данных.

Но confidence внешнего API не является гарантией качества AgroConnect. Реальное качество нужно измерять на наших полевых фотографиях.

---

## 4. Gemini

Конфигурация:

```env
PLANT_HEALTH_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.8-flash
```

Модель получает изображение, известную культуру поля как context hint и строгую инструкцию вернуть JSON максимум из трёх гипотез.

Важное различие: Gemini — **универсальная multimodal-модель**, а не специализированный фитопатологический classifier. Поэтому её результат используется в том же осторожном UX: «похоже на», а не как диагноз.

Провайдер полезен для:

- сравнения с узкоспециализированным crop.health;
- работы с более сложными/неидеальными фотографиями;
- будущего расширения объяснений результата естественным языком.

---

## 5. PlantVillage — локальный offline provider

### Что это значит

В AgroConnect используется готовая модель из Hugging Face:

```text
onnx-community/mobilenet_v2_1.0_224-plant-disease-identification-ONNX
```

Она обучена на классах PlantVillage и экспортирована в ONNX. **После однократного скачивания файлов модели интернет для inference не нужен.** Предсказание выполняется внутри backend через `onnxruntime` на CPU.

Это не означает, что модель надёжно диагностирует реальные российские поля. PlantVillage существенно отличается от полевых фотографий: изображения чище, лист обычно хорошо выделен, набор культур и заболеваний ограничен. Поэтому этот provider — offline fallback и исследовательский baseline, а не источник истины.

### Установка модели

Зависимости `numpy`, `Pillow` и `onnxruntime` уже устанавливаются в backend Docker image.

Скачать модель один раз:

```bash
python backend/scripts/download_plantvillage_model.py
```

Файлы попадут в:

```text
backend/models/plantvillage/
├── model_quantized.onnx
├── config.json
└── preprocessor_config.json
```

`backend/models/` добавлен в `.gitignore`, поэтому тяжёлые model weights не попадают в Git.

После этого:

```bash
PLANT_HEALTH_PROVIDER=plantvillage docker compose up -d --build
```

или выбрать `PlantVillage (локальная ONNX)` прямо в интерфейсе анализа.

При стандартном `docker-compose.yml` каталог `backend` смонтирован в `/app`, поэтому модель доступна контейнеру как `/app/models/plantvillage`.

### Полностью offline inference

После скачивания модели запрос выглядит так:

```text
mobile/web app
    ↓ локальная сеть
FastAPI
    ↓
onnxruntime CPU
    ↓
model_quantized.onnx
```

Никаких запросов к Hugging Face во время распознавания нет.

---

## 6. Demo provider

`demo` всегда доступен и возвращает фиксированный набор гипотез. Он нужен, чтобы:

- CI не зависел от внешней сети и API keys;
- демо на питче не ломалось из-за лимита/недоступности стороннего API;
- можно было проверить полностью пользовательскую цепочку: анализ → feedback → публикация → warning → dataset.

Для CI:

```env
PLANT_HEALTH_PROVIDER=demo
```

Важно: Demo provider нельзя выдавать за реальную ML-модель во время презентации. Его назначение — техническая воспроизводимость сценария.

---

## 7. Human-in-the-loop UX

ML-блок появляется только для публикации со статусом **«Проблема»** и после добавления фото.

UI показывает:

```text
AI-анализ проблемы

Провайдер: crop.health / Gemini / PlantVillage

Похоже на: Фитофтороз — 72%
Также возможно:
- Альтернариоз — 18%
- Дефицит питания — 7%

[Похоже] [Не похоже]

Если знаете правильный вариант:
[________________]
[Сохранить исправление]
```

Три варианта обратной связи:

- `accepted` — пользователь считает top-1 гипотезу похожей;
- `rejected` — пользователь считает результат неверным;
- `corrected` — пользователь вводит свою метку.

Для `accepted` и `corrected` формируется `final_label`. Именно она считается положительной разметкой для будущего обучения.

После подтверждения UI может добавить в комментарий публикации текст вида:

```text
AI-подсказка: похоже на «Фитофтороз». Кто-нибудь сталкивался с этим рядом?
```

Но пользователь может его отредактировать перед публикацией.

---

## 8. Связь с локальной сетью AgroConnect

После подтверждения/исправления результата и создания публикации пользователь может включить:

```text
☑ После публикации предупредить моих соседей в радиусе
```

Backend создаёт `Alert(type="disease")` только после человеческого подтверждения.

Получатели определяются из **явных соседей пользователя**, а география используется как дополнительное ограничение:

```text
distance <= broadcast_radius автора
и
distance <= news_radius получателя
```

Таким образом AI сам не рассылает неподтверждённую гипотезу как факт.

---

## 9. Собственный размеченный датасет AgroConnect

### Зачем он нужен

Главная долгосрочная ценность этапа 13 — не только внешний ML API, а накопление реальных фото из продуктового сценария.

Каждый анализ сохраняется в `plant_health_analyses`:

```text
id
user_id
field_id
provider
crop_hint
image_data_url
image_sha256
predictions[]
top_label
top_confidence
feedback_status
final_label
posted_post_id
feedback_at
created_at
```

Это позволяет со временем получить пары:

```text
реальное полевое фото → подтверждённая пользователем метка
```

или:

```text
реальное полевое фото → предсказание модели → исправление пользователя
```

### Что считается размеченным примером

В текущем MVP положительно размеченным считается запись, у которой заполнен `final_label`:

- `accepted`: `final_label = top_label`;
- `corrected`: `final_label = corrected_label`.

`rejected` тоже хранится и важен как negative feedback, но без знания правильного класса он не считается готовой supervised-label парой.

### Dataset API

Внутренний endpoint:

```http
GET /api/ml/dataset
```

По умолчанию:

- возвращает только размеченные записи;
- **не возвращает изображения**, чтобы случайно не тащить большие base64 payloads.

Для внутреннего экспорта с фото:

```http
GET /api/ml/dataset?include_images=true&labeled_only=true
```

Для анализа всех запусков, включая rejected/pending:

```http
GET /api/ml/dataset?labeled_only=false
```

В production этот endpoint должен быть закрыт служебной авторизацией. В hackathon MVP полноценная auth-система сознательно не вводится.

### Почему хранится SHA-256

`image_sha256` позволяет позднее:

- искать повторно загруженные изображения;
- не включать один и тот же снимок одновременно в train и test;
- строить дедупликацию датасета.

---

## 10. События и продуктовые метрики

Сохраняются события:

```text
ml_started
ml_result_shown
ml_provider_failed
ml_result_accepted
ml_result_rejected
ml_result_corrected
ml_dataset_labeled
post_created_after_ml
ml_neighbor_warning_sent
```

Backend-only dashboard:

```text
http://localhost:8000/internal/metrics
```

показывает:

- число запусков анализа;
- число сохранённых анализов;
- accepted / rejected / corrected;
- число размеченных примеров;
- label rate;
- распределение запусков по провайдерам;
- сколько ML-анализов превратилось в публикации;
- сколько раз после ML запускалось предупреждение соседям.

Эти метрики **не вынесены в мобильное приложение**.

---

## 11. API этапа 13

### Провайдеры

```http
GET /api/ml/providers
```

### Анализ

```http
POST /api/ml/analyze
Content-Type: application/json

{
  "user_id": 1,
  "field_id": 1,
  "image_data_url": "data:image/jpeg;base64,...",
  "provider": "kindwise"
}
```

`provider` можно не передавать — тогда используется `PLANT_HEALTH_PROVIDER`.

### Feedback

```http
PUT /api/ml/analyses/{analysis_id}/feedback

{
  "user_id": 1,
  "verdict": "accepted"
}
```

Исправление:

```json
{
  "user_id": 1,
  "verdict": "corrected",
  "corrected_label": "Альтернариоз"
}
```

### Связать с публикацией

```http
PUT /api/ml/analyses/{analysis_id}/post

{
  "user_id": 1,
  "post_id": 123
}
```

### Предупредить соседей

```http
POST /api/ml/analyses/{analysis_id}/notify-neighbors

{
  "user_id": 1
}
```

---

## 12. Ограничения текущего MVP

1. Результат любой модели — только предварительная гипотеза. Интерфейс намеренно не использует формулировку «диагноз».
2. crop.health и Gemini зависят от внешнего API, ключей, лимитов и интернета.
3. PlantVillage работает offline, но испытывает сильный domain shift на реальных полевых фотографиях.
4. Confidence разных провайдеров нельзя напрямую считать одинаково откалиброванной вероятностью.
5. Сейчас фото сохраняется как `data URL` в PostgreSQL. Для production изображения надо перенести в S3/MinIO, а в датасете хранить object key/version.
6. Подтверждение пользователя не равно лабораторно подтверждённому диагнозу. Для высококачественного датасета позже понадобятся expert-verified labels.
7. Disease warning сейчас отправляется только явным соседям, у которых есть поле и которые попадают в радиусы обеих сторон.
8. Dataset endpoint в MVP служебный, но без отдельной admin-auth.

---

## 13. Как перейти от накопленного датасета к собственной модели

После накопления достаточного объёма данных:

1. экспортировать accepted/corrected примеры;
2. дедуплицировать по `image_sha256` и perceptual hash;
3. провести ручную/экспертную ревизию части меток;
4. нормализовать taxonomy культур и заболеваний;
5. разделить dataset не случайно по картинкам, а по хозяйствам/полям/сериям съёмки;
6. оставить отдельный field-test set, который никогда не попадал в обучение;
7. взять pretrained backbone — например MobileNet/EfficientNet/ConvNeXt/ViT;
8. выполнить transfer learning;
9. оценивать минимум macro-F1, per-class recall, top-3 accuracy и confusion matrix;
10. откалибровать confidence;
11. добавить explicit `unknown`/OOD handling;
12. завернуть свою модель ещё одной реализацией `PlantHealthProvider`.

Целевая эволюция:

```text
v1: crop.health / Gemini / PlantVillage
                 ↓
      реальные фото AgroConnect
                 ↓
       feedback пользователей
                 ↓
        curated field dataset
                 ↓
          собственная модель
                 ↓
v2: AgroConnectPlantHealthProvider
```

Архитектура интерфейса провайдера позволяет сделать этот переход без изменения бизнес-логики приложения.

---

## 14. Как проверять качество корректно

Нельзя брать accuracy из model card и считать её качеством AgroConnect.

Для продукта нужен собственный benchmark из реальных фотографий целевого домена. Минимальный полезный набор для MVP-исследования — 100–200 фото нескольких ключевых культур, где ожидаемая метка проверена вручную.

Рекомендуемые метрики:

```text
Top-1 accuracy
Top-3 accuracy
Macro F1
Per-class precision / recall
Confusion matrix
Coverage при заданном confidence threshold
Calibration error
```

Отдельно следует измерять качество каждого provider на одном и том же test set. Тогда выбор crop.health, Gemini, PlantVillage или будущей собственной модели будет основан не на маркетинговой цифре поставщика, а на реальных данных AgroConnect.

---

## 15. Рекомендуемый режим для хакатона

Для настоящего показа при наличии ключа:

```env
PLANT_HEALTH_PROVIDER=kindwise
CROP_HEALTH_API_KEY=...
```

Резервный online вариант:

```env
PLANT_HEALTH_PROVIDER=gemini
GEMINI_API_KEY=...
```

Offline fallback после скачивания модели:

```env
PLANT_HEALTH_PROVIDER=plantvillage
```

Для CI и гарантированного сценарного демо:

```env
PLANT_HEALTH_PROVIDER=demo
```

На презентации лучше отдельно проговорить, какой provider используется в конкретной демонстрации.