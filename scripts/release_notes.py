"""Build bilingual GitHub release notes from the two maintained changelogs."""

from pathlib import Path
import re


def render_release_notes(version, root):
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Invalid release version")
    sections = []
    for filename, heading in (("CHANGELOG.uk.md", "Українська"), ("CHANGELOG.md", "English")):
        changelog = (Path(root) / filename).read_text(encoding="utf-8")
        section = re.search(
            r"^## " + re.escape(version) + r" — [^\n]+\n(.*?)(?=^## |\Z)",
            changelog, re.M | re.S,
        )
        if not section or not section[1].strip():
            raise ValueError(f"Missing changelog entry for {version} in {filename}")
        sections.append(f"## {heading}\n\n{section[1].strip()}")
    return "\n\n".join(sections) + "\n"
