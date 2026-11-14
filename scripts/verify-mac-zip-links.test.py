import importlib.util
from pathlib import Path
import stat
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("zip_policy", Path(__file__).with_name("verify-mac-zip-links.py"))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class ReleaseZipTests(unittest.TestCase):
    def inspect(self, name, target, compression):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "test.zip"
            entry = zipfile.ZipInfo(name)
            entry.create_system = 3
            entry.external_attr = (stat.S_IFLNK | 0o777) << 16
            with zipfile.ZipFile(archive, "w") as package:
                package.writestr(entry, target, compress_type=compression)
            return policy.inspect_zip(archive)

    def test_full_81_byte_stored_symlink_is_accepted(self):
        target = "Contents/Resources/" + "x" * 62
        self.assertEqual(len(target.encode()), 81)
        self.assertEqual(self.inspect("Agent Pi DSH.app/link", target, zipfile.ZIP_STORED)["symlinks"], 1)

    def test_deflated_symlink_that_triggered_finder_corruption_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "ZIP_STORED"):
            self.inspect("Agent Pi DSH.app/link", "Contents/Resources/" + "x" * 62, zipfile.ZIP_DEFLATED)

    def test_archive_path_traversal_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unsafe ZIP entry"):
            self.inspect("Agent Pi DSH.app/../outside", "file", zipfile.ZIP_STORED)

    def test_link_outside_application_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "escapes application"):
            self.inspect("Agent Pi DSH.app/link", "../../outside", zipfile.ZIP_STORED)


if __name__ == "__main__":
    unittest.main()
