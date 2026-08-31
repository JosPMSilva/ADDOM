import json
import sys

from markitdown import MarkItDown


def _emit(payload):
    print(json.dumps(payload, ensure_ascii=False))


def main():
    if len(sys.argv) < 2:
        _emit({"ok": False, "error": "input_path_missing"})
        return 2

    source_path = sys.argv[1]
    try:
        result = MarkItDown().convert(source_path)
        text = (
            getattr(result, "text_content", None)
            or getattr(result, "markdown", None)
            or str(result or "")
        )
        _emit({"ok": True, "text": text})
        return 0
    except Exception as exc:
        _emit({"ok": False, "error": str(exc)})
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
