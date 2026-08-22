#!/usr/bin/env python3
"""Zepp captcha OCR ported from AI-Step/step_brush.py."""
import base64
import sys
from collections import Counter
from io import BytesIO

import ddddocr
from PIL import Image, ImageEnhance, ImageFilter


def recognize(image_data: bytes) -> str:
    image = Image.open(BytesIO(image_data))
    if image.mode == "RGBA":
        background = Image.new("RGB", image.size, (255, 255, 255))
        background.paste(image, mask=image.split()[3])
        image = background
    elif image.mode != "RGB":
        image = image.convert("RGB")

    image = image.resize(
        (image.width * 2, image.height * 2), Image.Resampling.LANCZOS
    )
    image = ImageEnhance.Contrast(image.convert("L")).enhance(2.0)
    image = image.filter(ImageFilter.SHARPEN)
    image = image.point(lambda value: 255 if value > 128 else 0)

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    payload = buffer.getvalue()
    ocr = ddddocr.DdddOcr(show_ad=False)
    results = []
    for _ in range(3):
        result = (ocr.classification(payload) or "").lower().strip()
        if result:
            results.append(result)
    return Counter(results).most_common(1)[0][0] if results else ""


if __name__ == "__main__":
    try:
        raw = base64.b64decode(sys.stdin.read().strip(), validate=True)
        sys.stdout.write(recognize(raw))
    except Exception as exc:  # the Node caller handles OCR failure and retries
        sys.stderr.write(str(exc))
        raise SystemExit(1)
