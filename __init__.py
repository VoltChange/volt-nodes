from comfy_api.latest import ComfyExtension, io
from typing_extensions import override

from .multi_lora_loader import VoltMultiLoraLoader, register_routes
from .prompt_segments import VoltPromptSegments


WEB_DIRECTORY = "./web"


class VoltNodesExtension(ComfyExtension):
    @override
    async def on_load(self) -> None:
        register_routes()

    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [VoltMultiLoraLoader, VoltPromptSegments]


async def comfy_entrypoint() -> VoltNodesExtension:
    return VoltNodesExtension()


__all__ = ["WEB_DIRECTORY", "comfy_entrypoint"]
