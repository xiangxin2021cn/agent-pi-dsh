import importlib.util
import json
from contextlib import nullcontext
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("verify_macos_intel", Path(__file__).parents[1] / "verify-macos-intel.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def modern(minimum, sdk="15.0"):
    return f"""Load command 10
          cmd LC_BUILD_VERSION
      cmdsize 32
     platform 1
        minos {minimum}
          sdk {sdk}
       ntools 1
Load command 11
          cmd LC_SOURCE_VERSION
      version 1.0
"""


class MacOSIntelTests(unittest.TestCase):
    def test_monterey_slice_and_new_sdk_are_accepted(self):
        self.assertEqual(module.validate_slice("x86_64", modern("12.0"), "12.0"), "12.0")

    def test_ventura_dependency_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "13.0 exceeds 12.0"):
            module.validate_slice("x86_64", modern("13.0"), "12.0")

    def test_arm_only_dependency_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Missing x86_64 slice"):
            module.validate_slice("arm64", modern("12.0"), "12.0")

    def test_universal_binary_intel_slice_is_accepted(self):
        self.assertEqual(module.validate_slice("x86_64 arm64", modern("11.0"), "12.0"), "11.0")

    def test_old_minimum_version_command(self):
        text = """Load command 7
          cmd LC_VERSION_MIN_MACOSX
      cmdsize 16
      version 10.15
          sdk 12.3
"""
        self.assertEqual(module.validate_slice("x86_64", text, "12.0"), "10.15")

    def test_missing_minimum_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "no minimum"):
            module.validate_slice("x86_64", "Load command 1\n cmd LC_SOURCE_VERSION\n version 12.0", "12.0")

    def test_non_macos_platform_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "not a macOS"):
            module.validate_slice("x86_64", modern("12.0").replace("platform 1", "platform 2"), "12.0")

    def test_foreign_prebuild_allowance_is_narrow(self):
        for path in ("node_modules/node-pty/prebuilds/darwin-arm64/pty.node",
                     "node_modules/.pnpm/@koromix+koffi-darwin-arm64@3.1.1/node_modules/@koromix/koffi-darwin-arm64/koffi.node",
                     "node_modules/node-pty/prebuilds/win32-x64/conpty.node"):
            self.assertTrue(module.foreign_prebuild(Path(path)), path)
        for path in ("Contents/Frameworks/arm64/helper", "node_modules/koffi/build/Release/koffi.node",
                     "node_modules/@koromix/koffi-darwin-x64/koffi.node"):
            self.assertFalse(module.foreign_prebuild(Path(path)), path)

    def test_broken_packaged_link_fails_but_finishes_json_report(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            app = root / "Example.app"
            runtimes = ["Contents/MacOS/Example", "Contents/Resources/runtime/node/node",
                        "Contents/Resources/runtime/product/bundles/project-plan/runtime/jre/bin/java",
                        "Contents/Resources/runtime/node_modules/koffi/build/Release/koffi.node"]
            for name in runtimes:
                path = app / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(bytes.fromhex("cffaedfe") + b"mock Mach-O")
            (app / "Contents/Info.plist").write_bytes(plistlib.dumps({"CFBundleExecutable": "Example"}))
            broken = app / "Contents/Resources/runtime/broken-office-link"
            missing = root / "agent-pi-univer-runtime/node_modules"
            try:
                broken.symlink_to(missing, target_is_directory=True)
                resolve_context = nullcontext()
            except OSError:
                # Windows without symlink privileges exercises the same
                # Path.resolve failure without requiring elevated tests.
                broken.write_bytes(b"placeholder for unavailable symlink")
                original_resolve = Path.resolve

                def resolve_path(path, *args, **kwargs):
                    if path == broken:
                        raise FileNotFoundError(str(missing))
                    return original_resolve(path, *args, **kwargs)

                resolve_context = patch.object(Path, "resolve", resolve_path)

            def fake_tool(*args):
                if args[0] == "lipo":
                    return "x86_64"
                return "MH_MAGIC_64 X86_64 EXECUTE" if "-hv" in args else modern("12.0")

            report_path = root / "report.json"
            with resolve_context, patch.object(module, "tool", side_effect=fake_tool), \
                    patch.object(module.sys, "platform", "darwin"), \
                    patch.object(module.sys, "argv", ["verify-macos-intel.py", str(app), "--report", str(report_path)]):
                self.assertEqual(module.main(), 1)
            report = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertFalse(report["passed"])
            self.assertEqual({row["path"] for row in report["checkedFiles"]}, set(runtimes))
            self.assertTrue(any(row["path"].endswith("broken-office-link") and
                                "Cannot resolve packaged path" in row["error"] for row in report["errors"]))


if __name__ == "__main__":
    unittest.main()
