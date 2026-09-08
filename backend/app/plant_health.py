from __future__ import annotations

import base64
import io
import json
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx


class PlantHealthProviderError(RuntimeError):
    pass


@dataclass(slots=True)
class PlantHealthSuggestion:
    label: str
    confidence: float
    scientific_name: str | None = None
    category: str | None = None
    description: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "confidence": round(float(self.confidence), 4),
            "scientific_name": self.scientific_name,
            "category": self.category,
            "description": self.description,
        }


@dataclass(slots=True)
class PlantHealthResult:
    provider: str
    suggestions: list[PlantHealthSuggestion]


class PlantHealthProvider(ABC):
    name: str

    @abstractmethod
    def analyze(self, image_data_url: str, crop_hint: str | None = None) -> PlantHealthResult:
        raise NotImplementedError


def _decode_image_data_url(image_data_url: str) -> tuple[str, bytes, str]:
    if not image_data_url.startswith("data:image/") or "," not in image_data_url:
        raise PlantHealthProviderError("Image must be a data:image/* URL")
    header, encoded = image_data_url.split(",", 1)
    mime_type = header[5:].split(";", 1)[0]
    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise PlantHealthProviderError("Invalid base64 image") from exc
    if not image_bytes:
        raise PlantHealthProviderError("Empty image")
    return mime_type, image_bytes, encoded


def _clean_json_text(text: str) -> str:
    value = text.strip()
    if value.startswith("```"):
        value = value.removeprefix("```json").removeprefix("```")
        if value.endswith("```"):
            value = value[:-3]
    return value.strip()


class DemoPlantHealthProvider(PlantHealthProvider):
    name = "demo"

    def analyze(self, image_data_url: str, crop_hint: str | None = None) -> PlantHealthResult:
        _decode_image_data_url(image_data_url)
        crop = (crop_hint or "растение").strip()
        return PlantHealthResult(
            provider=self.name,
            suggestions=[
                PlantHealthSuggestion(
                    label="Фитофтороз",
                    scientific_name="Phytophthora infestans",
                    confidence=0.72,
                    category="fungi",
                    description=f"Демонстрационная гипотеза для культуры: {crop}.",
                ),
                PlantHealthSuggestion(label="Альтернариоз", confidence=0.18, category="fungi"),
                PlantHealthSuggestion(label="Дефицит питания", confidence=0.07, category="abiotic"),
            ],
        )


class KindwisePlantHealthProvider(PlantHealthProvider):
    name = "kindwise"

    def __init__(self) -> None:
        self.api_key = os.getenv("CROP_HEALTH_API_KEY", "").strip()
        self.url = os.getenv(
            "CROP_HEALTH_API_URL", "https://crop.kindwise.com/api/v1/identification"
        ).strip()
        if not self.api_key:
            raise PlantHealthProviderError("CROP_HEALTH_API_KEY is not configured")

    def analyze(self, image_data_url: str, crop_hint: str | None = None) -> PlantHealthResult:
        _, _, encoded = _decode_image_data_url(image_data_url)
        try:
            response = httpx.post(
                self.url,
                params={"details": "description,taxonomy"},
                headers={"Api-Key": self.api_key},
                json={"images": [encoded]},
                timeout=30.0,
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise PlantHealthProviderError(f"crop.health request failed: {exc}") from exc

        rows = payload.get("result", {}).get("disease", {}).get("suggestions", [])
        suggestions: list[PlantHealthSuggestion] = []
        for row in rows[:5]:
            details = row.get("details") or {}
            taxonomy = details.get("taxonomy") or {}
            category = taxonomy.get("kingdom") or row.get("type")
            suggestions.append(
                PlantHealthSuggestion(
                    label=str(row.get("name") or "Неизвестная проблема"),
                    scientific_name=row.get("scientific_name"),
                    confidence=float(row.get("probability") or 0),
                    category=str(category) if category else None,
                    description=details.get("description"),
                )
            )
        if not suggestions:
            raise PlantHealthProviderError("crop.health returned no disease suggestions")
        return PlantHealthResult(provider=self.name, suggestions=suggestions)


class GeminiPlantHealthProvider(PlantHealthProvider):
    name = "gemini"

    def __init__(self) -> None:
        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
        if not self.api_key:
            raise PlantHealthProviderError("GEMINI_API_KEY is not configured")

    def analyze(self, image_data_url: str, crop_hint: str | None = None) -> PlantHealthResult:
        mime_type, _, encoded = _decode_image_data_url(image_data_url)
        crop_context = crop_hint.strip() if crop_hint else "неизвестна"
        prompt = (
            "Ты ассистент по предварительной визуальной оценке здоровья сельхозкультур. "
            "Не утверждай диагноз. По изображению предложи максимум 3 наиболее вероятные гипотезы. "
            f"Известная культура: {crop_context}. "
            "Верни ТОЛЬКО JSON-массив объектов: "
            '[{"label":"...","confidence":0.0,"scientific_name":null,'
            '"category":"fungi|bacteria|virus|pest|abiotic|healthy|unknown",'
            '"description":"кратко, почему это похоже"}]. '
            "confidence должен быть числом от 0 до 1. Если изображение не позволяет оценить растение, "
            "верни один вариант unknown с низкой уверенностью."
        )
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        body = {
            "contents": [
                {
                    "parts": [
                        {"inline_data": {"mime_type": mime_type, "data": encoded}},
                        {"text": prompt},
                    ]
                }
            ],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1},
        }
        try:
            response = httpx.post(
                url,
                headers={"x-goog-api-key": self.api_key, "Content-Type": "application/json"},
                json=body,
                timeout=45.0,
            )
            response.raise_for_status()
            payload = response.json()
            parts = payload["candidates"][0]["content"]["parts"]
            text = next(str(part["text"]) for part in parts if part.get("text"))
            rows = json.loads(_clean_json_text(text))
        except (httpx.HTTPError, KeyError, IndexError, StopIteration, ValueError, TypeError) as exc:
            raise PlantHealthProviderError(f"Gemini request failed: {exc}") from exc

        if isinstance(rows, dict):
            rows = rows.get("suggestions", [])
        suggestions: list[PlantHealthSuggestion] = []
        for row in list(rows)[:3]:
            confidence = max(0.0, min(1.0, float(row.get("confidence") or 0)))
            suggestions.append(
                PlantHealthSuggestion(
                    label=str(row.get("label") or "Неизвестная проблема"),
                    scientific_name=row.get("scientific_name"),
                    confidence=confidence,
                    category=row.get("category"),
                    description=row.get("description"),
                )
            )
        if not suggestions:
            raise PlantHealthProviderError("Gemini returned no suggestions")
        suggestions.sort(key=lambda item: item.confidence, reverse=True)
        return PlantHealthResult(provider=self.name, suggestions=suggestions)


class PlantVillagePlantHealthProvider(PlantHealthProvider):
    """Local ONNX provider. It makes no network calls during inference."""

    name = "plantvillage"

    def __init__(self) -> None:
        model_dir = Path(os.getenv("PLANTVILLAGE_MODEL_DIR", "/app/models/plantvillage"))
        self.model_path = Path(os.getenv("PLANTVILLAGE_MODEL_PATH", str(model_dir / "model_quantized.onnx")))
        self.config_path = Path(os.getenv("PLANTVILLAGE_CONFIG_PATH", str(model_dir / "config.json")))
        self.preprocessor_path = Path(
            os.getenv("PLANTVILLAGE_PREPROCESSOR_PATH", str(model_dir / "preprocessor_config.json"))
        )
        missing = [path for path in (self.model_path, self.config_path, self.preprocessor_path) if not path.exists()]
        if missing:
            raise PlantHealthProviderError(
                "PlantVillage model is not installed. Run backend/scripts/download_plantvillage_model.py first."
            )

    def analyze(self, image_data_url: str, crop_hint: str | None = None) -> PlantHealthResult:
        try:
            import numpy as np
            import onnxruntime as ort
            from PIL import Image
        except ImportError as exc:
            raise PlantHealthProviderError(
                "PlantVillage dependencies are missing; install requirements-plantvillage.txt"
            ) from exc

        _, image_bytes, _ = _decode_image_data_url(image_data_url)
        config = json.loads(self.config_path.read_text(encoding="utf-8"))
        processor = json.loads(self.preprocessor_path.read_text(encoding="utf-8"))
        size_cfg = processor.get("size", 224)
        if isinstance(size_cfg, dict):
            size = int(size_cfg.get("height") or size_cfg.get("shortest_edge") or 224)
        else:
            size = int(size_cfg)

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((size, size))
        array = np.asarray(image).astype("float32")
        if processor.get("do_rescale", True):
            array *= float(processor.get("rescale_factor", 1 / 255))
        mean = np.asarray(processor.get("image_mean", [0.5, 0.5, 0.5]), dtype="float32")
        std = np.asarray(processor.get("image_std", [0.5, 0.5, 0.5]), dtype="float32")
        if processor.get("do_normalize", True):
            array = (array - mean) / std
        array = np.transpose(array, (2, 0, 1))[None, ...].astype("float32")

        session = ort.InferenceSession(str(self.model_path), providers=["CPUExecutionProvider"])
        input_name = session.get_inputs()[0].name
        logits = session.run(None, {input_name: array})[0][0]
        shifted = logits - np.max(logits)
        probabilities = np.exp(shifted) / np.exp(shifted).sum()
        top = probabilities.argsort()[-3:][::-1]
        id2label = config.get("id2label", {})

        suggestions = []
        for idx in top:
            raw_label = str(id2label.get(str(int(idx)), id2label.get(int(idx), f"class_{idx}")))
            label = raw_label.replace("___", " · ").replace("_", " ")
            suggestions.append(
                PlantHealthSuggestion(
                    label=label,
                    confidence=float(probabilities[idx]),
                    category="plantvillage",
                    description="Локальная классификация по модели PlantVillage; проверяйте на полевых данных.",
                )
            )
        return PlantHealthResult(provider=self.name, suggestions=suggestions)


PROVIDER_NAMES = ("kindwise", "gemini", "plantvillage", "demo")


def provider_status() -> list[dict[str, Any]]:
    model_dir = Path(os.getenv("PLANTVILLAGE_MODEL_DIR", "/app/models/plantvillage"))
    return [
        {
            "name": "kindwise",
            "label": "crop.health (Kindwise)",
            "configured": bool(os.getenv("CROP_HEALTH_API_KEY", "").strip()),
            "offline": False,
        },
        {
            "name": "gemini",
            "label": "Gemini",
            "configured": bool(os.getenv("GEMINI_API_KEY", "").strip()),
            "offline": False,
        },
        {
            "name": "plantvillage",
            "label": "PlantVillage (локальная ONNX)",
            "configured": (model_dir / "model_quantized.onnx").exists()
            or bool(os.getenv("PLANTVILLAGE_MODEL_PATH", "").strip()),
            "offline": True,
        },
        {"name": "demo", "label": "Demo", "configured": True, "offline": True},
    ]


def get_plant_health_provider(name: str | None = None) -> PlantHealthProvider:
    selected = (name or os.getenv("PLANT_HEALTH_PROVIDER", "kindwise")).strip().lower()
    if selected == "kindwise":
        return KindwisePlantHealthProvider()
    if selected == "gemini":
        return GeminiPlantHealthProvider()
    if selected == "plantvillage":
        return PlantVillagePlantHealthProvider()
    if selected == "demo":
        return DemoPlantHealthProvider()
    raise PlantHealthProviderError(f"Unknown plant health provider: {selected}")
