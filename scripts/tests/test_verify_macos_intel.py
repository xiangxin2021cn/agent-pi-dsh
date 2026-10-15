import importlib.util
from pathlib import Path
import unittest


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


if __name__ == "__main__":
    unittest.main()
