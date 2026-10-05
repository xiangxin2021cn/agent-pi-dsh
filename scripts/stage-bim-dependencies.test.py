import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("stage_bim_dependencies", Path(__file__).with_name("stage-bim-dependencies.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DependencyBaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.output = self.root / "base"

    def archive(self, name, files):
        path = self.root / name
        with zipfile.ZipFile(path, "w") as archive:
            for filename, data in files.items():
                archive.writestr(filename, data)
        data = path.read_bytes()
        return {"file": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}

    def pins(self):
        return {"python": {"archive": self.archive("python.zip", {"python.exe": b"python", "python313._pth": b"original", "LICENSE.txt": b"python license"})},
                "packages": [{"wheel": self.archive("package.whl", {"package.py": b"value = 1", "package.dist-info/LICENSE": b"package license"})}]}

    def test_assembly_retains_licenses_and_source_hashes(self):
        manifest = module.stage_dependency_base(self.pins(), self.root, self.output)
        self.assertFalse(manifest["publicReleaseReviewed"])
        self.assertEqual((self.output / "python/python313._pth").read_bytes(), module.PTH)
        self.assertEqual((self.output / "python/LICENSE.txt").read_bytes(), b"python license")
        self.assertEqual((self.output / "python/Lib/site-packages/package.dist-info/LICENSE").read_bytes(), b"package license")
        for row in manifest["files"]:
            data = (self.output / row["path"]).read_bytes()
            self.assertEqual(row["sha256"], hashlib.sha256(data).hexdigest())
        self.assertEqual(len([row for row in manifest["files"] if row["sourceArchive"] is None]), 1)

    def test_hash_mismatch_rejected_before_output(self):
        pins = self.pins()
        (self.root / pins["packages"][0]["wheel"]["file"]).write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "hash or size mismatch"):
            module.stage_dependency_base(pins, self.root, self.output)
        self.assertFalse(self.output.exists())

    def test_output_cannot_overwrite_existing_runtime(self):
        self.output.mkdir()
        with self.assertRaisesRegex(ValueError, "new directory"):
            module.stage_dependency_base(self.pins(), self.root, self.output)

    def test_archive_cannot_escape_output(self):
        pins = self.pins()
        pins["python"]["archive"] = self.archive("unsafe.zip", {"../escaped.txt": b"invalid"})
        with self.assertRaisesRegex(ValueError, "Unsafe archive member"):
            module.stage_dependency_base(pins, self.root, self.output)
        self.assertFalse((self.root / "escaped.txt").exists())

    def test_wheels_cannot_replace_another_package(self):
        pins = self.pins()
        pins["packages"].append({"wheel": self.archive("overlap.whl", {"package.py": b"replacement"})})
        with self.assertRaisesRegex(ValueError, "Duplicate archive member"):
            module.stage_dependency_base(pins, self.root, self.output)
        self.assertEqual((self.output / "python/Lib/site-packages/package.py").read_bytes(), b"value = 1")


if __name__ == "__main__":
    unittest.main()
