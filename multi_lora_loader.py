import os
from collections import OrderedDict
import re
from urllib.parse import quote
import json

import comfy.sd
import comfy.utils
import folder_paths
from aiohttp import web
from comfy_api.latest import io
from server import PromptServer


NODE_ID = "VoltMultiLoraLoader"
NONE_LORA = "None"
MAX_LORA_SLOTS = 20
DEFAULT_CONFIG = "[]"
_PREVIEW_EXTENSIONS = (".preview.png", ".preview.jpg", ".preview.jpeg", ".preview.webp", ".png", ".jpg", ".jpeg", ".webp")
_LORA_CACHE = OrderedDict()
_LORA_CACHE_LIMIT = 12
_LORA_METADATA_CACHE = OrderedDict()
_LORA_METADATA_CACHE_LIMIT = 128
_ROUTES_REGISTERED = False
_CIVITAI_URL_RE = re.compile(r"https?://(?:www\.)?civitai\.(?:com|red)/[^\s\"'<>)]*", re.IGNORECASE)
_CIVITAI_AIR_RE = re.compile(r":civitai:(\d+)@(\d+)", re.IGNORECASE)


def _coerce_float(value, default=1.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _coerce_bool(value, default=True):
    if isinstance(value, str):
        return value.strip().lower() not in ("false", "0", "off", "no", "")
    if value is None:
        return default
    return bool(value)


def _normalize_row(row):
    name = row.get("name") or row.get("lora") or row.get("lora_name") or NONE_LORA
    if name in ("", NONE_LORA):
        return None

    return {
        "enabled": _coerce_bool(row.get("enabled", True)),
        "name": str(name),
        "strength_model": _coerce_float(row.get("strength_model", row.get("strength", 1.0))),
        "note": str(row.get("note", "")),
    }


def _parse_config(loras_config):
    if not loras_config:
        return []
    if isinstance(loras_config, dict):
        raw = loras_config
    elif isinstance(loras_config, list):
        raw = {"loras": loras_config}
    elif isinstance(loras_config, str):
        try:
            raw = json.loads(loras_config)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Volt Multi LoRA config is not valid JSON: {exc}") from exc
    else:
        return []

    rows = raw.get("loras", raw) if isinstance(raw, dict) else raw
    if not isinstance(rows, list):
        raise ValueError("Volt Multi LoRA config must be a list or an object containing a 'loras' list.")

    normalized = []
    for row in rows[:MAX_LORA_SLOTS]:
        if not isinstance(row, dict):
            continue
        item = _normalize_row(row)
        if item is not None:
            normalized.append(item)
    return normalized


def _load_lora(path):
    stat = os.stat(path)
    signature = (path, stat.st_mtime_ns, stat.st_size)
    cached = _LORA_CACHE.get(signature)
    if cached is not None:
        _LORA_CACHE.move_to_end(signature)
        return cached

    lora, metadata = comfy.utils.load_torch_file(path, safe_load=True, return_metadata=True)
    _LORA_CACHE[signature] = (lora, metadata)
    while len(_LORA_CACHE) > _LORA_CACHE_LIMIT:
        _LORA_CACHE.popitem(last=False)
    return lora, metadata


def _apply_loras(model, rows):
    current_model = model
    for row in rows:
        if not row["enabled"] or row["strength_model"] == 0:
            continue

        lora_path = folder_paths.get_full_path("loras", row["name"])
        if lora_path is None:
            raise FileNotFoundError(f"LoRA not found: {row['name']}")

        lora, metadata = _load_lora(lora_path)
        current_model, _ = comfy.sd.load_lora_for_models(
            current_model,
            None,
            lora,
            row["strength_model"],
            0.0,
            lora_metadata=metadata,
        )
    return current_model


def _safe_lora_path(name):
    if not name or name == NONE_LORA:
        return None
    return folder_paths.get_full_path("loras", name)


def _preview_for_lora(path):
    if not path:
        return None

    base, _ = os.path.splitext(path)
    directory = os.path.dirname(path)
    basename = os.path.basename(base)
    candidates = [base + ext for ext in _PREVIEW_EXTENSIONS]
    candidates.extend(os.path.join(directory, basename + ext) for ext in _PREVIEW_EXTENSIONS)

    for candidate in candidates:
        if os.path.isfile(candidate):
            return candidate
    return None


def _metadata_sidecar_for_lora(path):
    if not path:
        return None

    base, _ = os.path.splitext(path)
    candidates = (base + ".metadata.json", path + ".metadata.json")
    for candidate in candidates:
        if os.path.isfile(candidate):
            return candidate
    return None


def _read_json_sidecar(path):
    metadata_path = _metadata_sidecar_for_lora(path)
    if metadata_path is None:
        return None

    try:
        stat = os.stat(metadata_path)
    except OSError:
        return None

    signature = (metadata_path, stat.st_mtime_ns, stat.st_size)
    cached = _LORA_METADATA_CACHE.get(signature)
    if cached is not None:
        _LORA_METADATA_CACHE.move_to_end(signature)
        return cached

    try:
        with open(metadata_path, "r", encoding="utf-8") as handle:
            metadata = json.load(handle)
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return None

    _LORA_METADATA_CACHE[signature] = metadata
    while len(_LORA_METADATA_CACHE) > _LORA_METADATA_CACHE_LIMIT:
        _LORA_METADATA_CACHE.popitem(last=False)
    return metadata


def _string_id(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return ""
    value = str(value).strip()
    return value if value.isdigit() else ""


def _walk_strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from _walk_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_strings(child)


def _civitai_url_from_metadata(metadata):
    if not isinstance(metadata, dict):
        return None

    civitai = metadata.get("civitai")
    if isinstance(civitai, dict):
        model_id = _string_id(civitai.get("modelId"))
        version_id = _string_id(civitai.get("id"))
        if not model_id:
            model = civitai.get("model")
            if isinstance(model, dict):
                model_id = _string_id(model.get("id"))
        if model_id:
            url = f"https://civitai.red/models/{model_id}"
            if version_id:
                url += f"?modelVersionId={version_id}"
            return url

    for text in _walk_strings(metadata):
        air_match = _CIVITAI_AIR_RE.search(text)
        if air_match:
            return f"https://civitai.red/models/{air_match.group(1)}?modelVersionId={air_match.group(2)}"

    for text in _walk_strings(metadata):
        for match in _CIVITAI_URL_RE.finditer(text):
            url = match.group(0).rstrip(".,;")
            if "/api/download/" not in url.lower():
                return url
    return None


def _civitai_url_for_lora(path):
    return _civitai_url_from_metadata(_read_json_sidecar(path))


async def get_loras(_request):
    items = []
    for name in folder_paths.get_filename_list("loras"):
        path = _safe_lora_path(name)
        preview_path = _preview_for_lora(path)
        items.append(
            {
                "name": name,
                "directory": os.path.dirname(name).replace("\\", "/"),
                "preview": f"/volt-nodes/lora-preview?name={quote(name)}" if preview_path else None,
                "civitai_url": _civitai_url_for_lora(path),
            }
        )
    return web.json_response({"loras": items})


async def get_lora_preview(request):
    name = request.query.get("name", "")
    path = _safe_lora_path(name)
    preview_path = _preview_for_lora(path)
    if preview_path is None:
        raise web.HTTPNotFound(text="LoRA preview not found")
    return web.FileResponse(preview_path)


def register_routes():
    global _ROUTES_REGISTERED
    prompt_server = getattr(PromptServer, "instance", None)
    if _ROUTES_REGISTERED or prompt_server is None:
        return

    prompt_server.routes.get("/volt-nodes/loras")(get_loras)
    prompt_server.routes.get("/volt-nodes/lora-preview")(get_lora_preview)
    _ROUTES_REGISTERED = True


register_routes()


class VoltMultiLoraLoader(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        inputs = [
            io.Model.Input("model", tooltip="The diffusion model the LoRAs will be applied to."),
            io.String.Input(
                "loras_config",
                default=DEFAULT_CONFIG,
                multiline=True,
                tooltip="Serialized LoRA manager state. The frontend editor updates this automatically.",
            )
        ]

        return io.Schema(
            node_id=NODE_ID,
            display_name="Volt Multi LoRA Loader",
            category="Volt Nodes",
            description="Model-only multi LoRA loader with a frontend management panel.",
            inputs=inputs,
            outputs=[io.Model.Output("MODEL")],
            search_aliases=["multi lora", "lora manager", "volt lora"],
        )

    @classmethod
    def execute(cls, model, loras_config=DEFAULT_CONFIG):
        return io.NodeOutput(_apply_loras(model, _parse_config(loras_config)))
