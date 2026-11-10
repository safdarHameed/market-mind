"""Turn a Pydantic model into a self-contained JSON schema (no $ref) for tool input."""

from __future__ import annotations

import copy
from typing import Any

from pydantic import BaseModel


def inline_schema(model: type[BaseModel]) -> dict[str, Any]:
    schema = model.model_json_schema()
    defs = schema.pop("$defs", {})

    def resolve(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                name = node["$ref"].split("/")[-1]
                merged = copy.deepcopy(defs[name])
                extra = {k: v for k, v in node.items() if k != "$ref"}
                merged.update(extra)
                return resolve(merged)
            # Drop schema "title" annotations (strings) but keep properties named "title" (dicts).
            return {k: resolve(v) for k, v in node.items() if not (k == "title" and isinstance(v, str))}
        if isinstance(node, list):
            return [resolve(v) for v in node]
        return node

    return resolve(schema)
