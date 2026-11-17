"""Wood stereotomy helpers: cut-plane math, shop checks, templates and build123d modeling.

`geometry`, `shop`, `joinery`, `templates` and `sheet` use only the standard library.
`model` needs build123d and is imported on demand.
"""
from . import geometry, joinery, sheet, shop, templates  # noqa: F401

__all__ = ["geometry", "joinery", "sheet", "shop", "templates"]
