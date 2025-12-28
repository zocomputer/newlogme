"""
Configuration loading and management for ulogme.
"""

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import tomllib
except ImportError:
    import tomli as tomllib


@dataclass
class CategoryRule:
    """A single category mapping rule."""
    pattern: re.Pattern[str]
    category: str


@dataclass
class Config:
    """ulogme configuration."""
    # Tracking settings
    window_titles: bool = True
    browser_tabs: bool = True
    browser_urls: bool = True
    keystrokes: bool = True
    window_poll_interval: float = 2.0
    keystroke_window: float = 9.0
    
    # Day boundary
    day_boundary_hour: int = 7
    
    # Database path
    db_path: Path = field(default_factory=lambda: Path("data/ulogme.duckdb"))
    
    # Category mappings
    category_rules: list[CategoryRule] = field(default_factory=list)
    
    # Hacking categories
    hacking_categories: list[str] = field(default_factory=lambda: ["Coding", "Terminal"])
    
    # Base directory (where config file is located)
    base_dir: Path = field(default_factory=Path.cwd)
    
    @property
    def absolute_db_path(self) -> Path:
        """Get the absolute path to the database file."""
        if self.db_path.is_absolute():
            return self.db_path
        return self.base_dir / self.db_path


def load_config(config_path: Path | str | None = None) -> Config:
    """
    Load configuration from a TOML file.
    
    Args:
        config_path: Path to the config file. If None, searches for ulogme.toml
                    in the current directory and parent directories.
    
    Returns:
        Loaded configuration
    """
    if config_path is None:
        config_path = find_config_file()
    else:
        config_path = Path(config_path)
    
    if config_path is None or not config_path.exists():
        # Return default config
        return Config()
    
    with open(config_path, "rb") as f:
        data = tomllib.load(f)
    
    return parse_config(data, config_path.parent)


def find_config_file() -> Path | None:
    """Search for ulogme.toml in current and parent directories."""
    current = Path.cwd()
    
    # Check current directory and parents
    for directory in [current] + list(current.parents):
        config_file = directory / "ulogme.toml"
        if config_file.exists():
            return config_file
    
    # Check the directory where the tracker module is located
    module_dir = Path(__file__).parent.parent
    config_file = module_dir / "ulogme.toml"
    if config_file.exists():
        return config_file
    
    return None


def parse_config(data: dict[str, Any], base_dir: Path) -> Config:
    """Parse configuration data into a Config object."""
    tracking = data.get("tracking", {})
    day_boundary = data.get("day_boundary", {})
    database = data.get("database", {})
    category_mappings = data.get("category_mappings", {})
    hacking = data.get("hacking", {})
    
    # Parse category rules
    rules = []
    for rule in category_mappings.get("rules", []):
        try:
            pattern = re.compile(rule["pattern"], re.IGNORECASE)
            rules.append(CategoryRule(pattern=pattern, category=rule["category"]))
        except (KeyError, re.error) as e:
            print(f"Warning: Invalid category rule: {rule} - {e}")
    
    return Config(
        window_titles=tracking.get("window_titles", True),
        browser_tabs=tracking.get("browser_tabs", True),
        browser_urls=tracking.get("browser_urls", True),
        keystrokes=tracking.get("keystrokes", True),
        window_poll_interval=tracking.get("window_poll_interval", 2.0),
        keystroke_window=tracking.get("keystroke_window", 9.0),
        day_boundary_hour=day_boundary.get("hour", 7),
        db_path=Path(database.get("path", "data/ulogme.duckdb")),
        category_rules=rules,
        hacking_categories=hacking.get("categories", ["Coding", "Terminal"]),
        base_dir=base_dir,
    )


def categorize_window(app_name: str, window_title: str | None, config: Config) -> str:
    """
    Categorize a window based on app name and title.
    
    Args:
        app_name: The application name
        window_title: The window title (may be None)
        config: The configuration with category rules
    
    Returns:
        The category name, or "Other" if no match
    """
    # Combine app name and window title for matching
    full_text = app_name
    if window_title:
        full_text = f"{app_name} :: {window_title}"
    
    for rule in config.category_rules:
        if rule.pattern.search(full_text):
            return rule.category
    
    return "Other"

