#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from urllib.request import urlopen

BASE_URL = "https://huggingface.co/onnx-community/mobilenet_v2_1.0_224-plant-disease-identification-ONNX/resolve/main"
FILES = {
    "model_quantized.onnx": f"{BASE_URL}/onnx/model_quantized.onnx",
    "config.json": f"{BASE_URL}/config.json",
    "preprocessor_config.json": f"{BASE_URL}/preprocessor_config.json",
}


def download(url: str, target: Path) -> None:
    print(f"Downloading {target.name} ...")
    with urlopen(url, timeout=120) as response, target.open("wb") as out:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    print(f"Saved {target} ({target.stat().st_size / 1024 / 1024:.1f} MiB)")


def main() -> None:
    default_dir = Path(__file__).resolve().parents[1] / "models" / "plantvillage"
    parser = argparse.ArgumentParser(description="Download the local PlantVillage ONNX model used by AgroConnect.")
    parser.add_argument("--target", type=Path, default=default_dir)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    args.target.mkdir(parents=True, exist_ok=True)
    for filename, url in FILES.items():
        target = args.target / filename
        if target.exists() and not args.force:
            print(f"Skip {target}: already exists")
            continue
        download(url, target)

    print("Done. PlantVillage inference can now run without internet access.")


if __name__ == "__main__":
    main()
