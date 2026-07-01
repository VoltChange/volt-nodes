import re

from comfy_api.latest import io


NODE_ID = "VoltMagicPromptBox"


def _ensure_trailing_comma_per_line(text: str) -> str:
    if not text or not isinstance(text, str):
        return text if isinstance(text, str) else ""
    lines = text.split("\n")
    out = []
    for line in lines:
        stripped = line.rstrip(" \t\u3000")
        if not stripped:
            out.append("")
        elif re.search(r",\s*$", stripped):
            out.append(stripped)
        else:
            out.append(stripped + ",")
    return "\n".join(out)


def _active_prompt_string(text: str) -> str:
    if not text or not isinstance(text, str):
        return ""
    parts = []
    for segment in re.split(r"[\n,]+", text):
        value = segment.strip()
        if not value or value.startswith("*"):
            continue
        parts.append(value)
    return ", ".join(parts)


class VoltMagicPromptBox(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id=NODE_ID,
            display_name="Volt Magic Prompt Box",
            category="Volt Nodes",
            description="Magic Assistant prompt editor ported into Volt Nodes.",
            inputs=[
                io.String.Input(
                    "text",
                    default="",
                    multiline=True,
                    extra_dict={"dynamicPrompts": False},
                ),
                io.String.Input(
                    "prepend_text",
                    default="",
                    optional=True,
                    force_input=True,
                    extra_dict={"dynamicPrompts": False},
                ),
                io.Clip.Input("clip", optional=True),
            ],
            outputs=[
                io.String.Output("final_text"),
                io.Conditioning.Output("conditioning"),
                io.Clip.Output("clip"),
            ],
            search_aliases=[
                "magic prompt box",
                "prompt editor",
                "danbooru prompt",
                "volt magic",
            ],
        )

    @classmethod
    def execute(cls, text="", prepend_text="", clip=None):
        active_main = _active_prompt_string(text)
        active_prepend = _active_prompt_string(prepend_text) if prepend_text else ""

        result_text = active_prepend
        if active_main:
            result_text = f"{result_text}, {active_main}" if result_text else active_main

        result_text = _ensure_trailing_comma_per_line(result_text)

        conditioning = None
        if clip is not None:
            tokens = clip.tokenize(result_text)
            conditioning = clip.encode_from_tokens_scheduled(tokens)

        return io.NodeOutput(result_text, conditioning, clip)
