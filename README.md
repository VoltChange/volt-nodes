# Volt Nodes

Custom ComfyUI nodes for local workflows.

## Volt Multi LoRA Loader

A ComfyUI Nodes 2.0 / V3 custom node for loading and managing multiple model-only LoRAs.

Features:

- `MODEL` input and `MODEL` output
- Multiple LoRA entries with enable/disable, strength, and note fields
- Frontend LoRA manager with preview support
- Workflow-safe JSON state saving through `loras_config`

## Installation

Clone this repository into your ComfyUI `custom_nodes` directory:

```bash
git clone <repo-url> ComfyUI/custom_nodes/volt-nodes
```

Restart ComfyUI after installation.
