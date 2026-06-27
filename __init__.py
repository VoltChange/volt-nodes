from .multi_lora_loader import VoltNodesExtension


WEB_DIRECTORY = "./web"


async def comfy_entrypoint() -> VoltNodesExtension:
    return VoltNodesExtension()


__all__ = ["WEB_DIRECTORY", "comfy_entrypoint"]
