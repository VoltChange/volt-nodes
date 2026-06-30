import json

from comfy_api.latest import io


NODE_ID = "VoltPromptSegments"
MAX_PROMPT_SEGMENTS = 64
DEFAULT_CONFIG = '{"separator": ", ", "segments": []}'


def _coerce_bool(value, default=True):
    if isinstance(value, str):
        return value.strip().lower() not in ("false", "0", "off", "no", "")
    if value is None:
        return default
    return bool(value)


def _normalize_segment(segment):
    if not isinstance(segment, dict):
        return None

    return {
        "enabled": _coerce_bool(segment.get("enabled", True)),
        "label": str(segment.get("label", "")),
        "text": str(segment.get("text", "")),
    }


def parse_config(segments_config):
    if not segments_config:
        return ", ", []
    if isinstance(segments_config, dict):
        raw = segments_config
    elif isinstance(segments_config, list):
        raw = {"segments": segments_config}
    elif isinstance(segments_config, str):
        try:
            raw = json.loads(segments_config)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Volt Prompt Segments config is not valid JSON: {exc}") from exc
    else:
        return ", ", []

    separator = str(raw.get("separator", ", ")) if isinstance(raw, dict) else ", "
    segments = raw.get("segments", raw) if isinstance(raw, dict) else raw
    if not isinstance(segments, list):
        raise ValueError("Volt Prompt Segments config must be a list or an object containing a 'segments' list.")

    normalized = []
    for segment in segments[:MAX_PROMPT_SEGMENTS]:
        item = _normalize_segment(segment)
        if item is not None:
            normalized.append(item)
    return separator, normalized


def build_prompt(segments_config):
    separator, segments = parse_config(segments_config)
    texts = [segment["text"].strip() for segment in segments if segment["enabled"] and segment["text"].strip()]
    return separator.join(texts)


class VoltPromptSegments(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id=NODE_ID,
            display_name="Volt Prompt Segments",
            category="text/prompt",
            description="Manage prompt text segments and join enabled segments with a configurable separator.",
            inputs=[
                io.String.Input(
                    "segments_config",
                    default=DEFAULT_CONFIG,
                    multiline=True,
                    tooltip="Serialized prompt segment editor state. The frontend editor updates this automatically.",
                )
            ],
            outputs=[io.String.Output("prompt")],
            search_aliases=["prompt segments", "prompt manager", "text segments", "volt prompt"],
        )

    @classmethod
    def execute(cls, segments_config=DEFAULT_CONFIG):
        return io.NodeOutput(build_prompt(segments_config))
