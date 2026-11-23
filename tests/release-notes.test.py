import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("release_notes", ROOT / "scripts/release_notes.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReleaseNotesTests(unittest.TestCase):
    def test_both_languages_are_extracted_for_the_same_version_with_ukrainian_first(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for filename, text in (("CHANGELOG.md", "English change"), ("CHANGELOG.uk.md", "Українська зміна")):
                (root / filename).write_text(
                    f"# Changelog\n\n## Unreleased\n\nNot released\n\n## 1.2.3 — 2026-11-23\n\n- {text}\n\n## 1.2.2 — 2026-11-22\n\nOld change\n",
                    encoding="utf-8",
                )
            self.assertEqual(module.render_release_notes("1.2.3", root),
                             "## Українська\n\n- Українська зміна\n\n## English\n\n- English change\n")

    def test_missing_translation_prevents_publishing_partial_notes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "CHANGELOG.md").write_text("## 1.2.3 — 2026-11-23\n\n- English\n")
            (root / "CHANGELOG.uk.md").write_text("## 1.2.2 — 2026-11-22\n\n- Українська\n")
            with self.assertRaisesRegex(ValueError, "CHANGELOG.uk.md"):
                module.render_release_notes("1.2.3", root)

    def test_empty_entry_and_invalid_version_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "CHANGELOG.uk.md").write_text("## 1.2.3 — 2026-11-23\n\n")
            with self.assertRaisesRegex(ValueError, "Missing changelog"):
                module.render_release_notes("1.2.3", root)
            with self.assertRaisesRegex(ValueError, "Invalid release version"):
                module.render_release_notes("1x2x3", root)


if __name__ == "__main__":
    unittest.main()
