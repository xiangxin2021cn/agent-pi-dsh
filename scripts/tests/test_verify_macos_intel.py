import importlib.util
import json
from contextlib import nullcontext
from pathlib import Path
import plistlib
from subprocess import CompletedProcess
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

    def test_arm64_slice_requires_the_selected_architecture(self):
        self.assertEqual(module.validate_slice("arm64", modern("14.0"), "14.0", "arm64"), "14.0")
        with self.assertRaisesRegex(ValueError, "Missing arm64 slice"):
            module.validate_slice("x86_64", modern("14.0"), "14.0", "arm64")

    def test_arm64_app_checks_target_dependencies_and_plist_but_ignores_foreign_prebuilds(self):
        for dependency_minimum, plist_minimum in (("14.0", "14.0"), ("15.0", "14.0"), ("14.0", "15.0")):
            with self.subTest(dependency=dependency_minimum, plist=plist_minimum), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                app = root / "Example.app"
                runtimes = ["Contents/MacOS/Example", "Contents/Resources/runtime/node/node",
                            "Contents/Resources/runtime/product/bundles/project-plan/runtime/jre/bin/java",
                            "Contents/Resources/runtime/node_modules/@koromix/koffi-darwin-arm64/koffi.node"]
                foreign = "Contents/Resources/runtime/node_modules/@koromix/koffi-darwin-x64/koffi.node"
                for name in runtimes + [foreign]:
                    path = app / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(bytes.fromhex("cffaedfe") + b"mock Mach-O")
                (app / "Contents/Info.plist").write_bytes(plistlib.dumps({
                    "CFBundleExecutable": "Example", "LSMinimumSystemVersion": "14.0",
                    "LSMinimumSystemVersionByArchitecture": {"arm64": plist_minimum}}))
                observed = []

                def fake_tool(*args):
                    self.assertNotIn("koffi-darwin-x64", args[-1])
                    observed.append(args)
                    if args[0] == "lipo":
                        return "arm64"
                    self.assertEqual(args[1:3], ("-arch", "arm64"))
                    if "-hv" in args:
                        return "MH_MAGIC_64 ARM64 EXECUTE"
                    return modern(dependency_minimum if args[-1].endswith("koffi.node") else "14.0")

                report_path = root / "report.json"
                with patch.object(module, "tool", side_effect=fake_tool), \
                        patch.object(module.sys, "platform", "darwin"), \
                        patch.object(module.sys, "argv", ["verify-macos-intel.py", str(app), "--arch", "arm64",
                                                        "--maximum-macos", "14.0", "--report", str(report_path)]):
                    expected = dependency_minimum == "14.0" and plist_minimum == "14.0"
                    self.assertEqual(module.main(), 0 if expected else 1)
                report = json.loads(report_path.read_text(encoding="utf-8"))
                self.assertEqual(report["architecture"], "arm64")
                self.assertEqual(report["passed"], expected)
                self.assertEqual({row["path"] for row in report["checkedFiles"]}, set(runtimes))
                self.assertEqual(report["ignoredForeignPrebuilds"], [foreign])
                self.assertTrue(any(args[0] == "otool" for args in observed))
                if not expected:
                    self.assertTrue(any("15.0 exceeds 14.0" in row["error"] for row in report["errors"]))

    def test_old_minimum_version_command(self):
        text = """Load command 7
          cmd LC_VERSION_MIN_MACOSX
      cmdsize 16
      version 10.15
          sdk 12.3
"""
        self.assertEqual(module.validate_slice("x86_64", text, "12.0"), "10.15")

    def test_pnpm_windows_reflinks_do_not_hide_real_macos_15_requirements(self):
        with tempfile.TemporaryDirectory() as directory:
            app = Path(directory) / "Example.app"
            runtimes = ["Contents/MacOS/Example", "Contents/Resources/runtime/node/node",
                        "Contents/Resources/runtime/product/bundles/project-plan/runtime/jre/bin/java"]
            newer = ["Contents/Resources/runtime/node_modules/node-addon-require-builtin-darwin-arm64/prebuilt/darwin-arm64-napi-v9.node",
                     "Contents/Resources/runtime/node_modules/@openai/codex/vendor/aarch64-apple-darwin/codex-resources/zsh/bin/zsh"]
            foreign = [f"Contents/Resources/runtime/node/node_modules/pnpm/dist/node_modules/@reflink/reflink-win32-{arch}-msvc/reflink.win32-{arch}-msvc.node"
                       for arch in ("x64", "arm64")]
            for name in runtimes + newer + foreign:
                path = app / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"MZ Windows prebuild" if name in foreign else bytes.fromhex("cffaedfe") + b"mock Mach-O")
            (app / "Contents/Info.plist").write_bytes(plistlib.dumps({"CFBundleExecutable": "Example"}))

            def fake_tool(*args):
                self.assertNotIn("reflink-win32", args[-1])
                if args[0] == "lipo":
                    return "arm64"
                if "-hv" in args:
                    return "MH_MAGIC_64 ARM64 EXECUTE"
                relative = Path(args[-1]).relative_to(app).as_posix()
                return modern("15.0" if relative in newer else "14.0")

            with patch.object(module, "tool", side_effect=fake_tool):
                report = module.inspect_app(app, "14.0", "arm64")
                self.assertEqual({row["path"] for row in report["errors"]}, set(newer))
                self.assertTrue(all("15.0 exceeds 14.0" in row["error"] for row in report["errors"]))
                self.assertEqual(set(report["ignoredForeignPrebuilds"]), set(foreign))
                self.assertTrue(module.inspect_app(app, "15.0", "arm64")["passed"])
                unknown = app / "Contents/Resources/runtime/node_modules/unknown/native.node"
                unknown.parent.mkdir(parents=True)
                unknown.write_bytes(b"MZ unknown runtime")
                report = module.inspect_app(app, "15.0", "arm64")
                self.assertFalse(report["passed"])
                self.assertEqual(report["errors"], [{"path": unknown.relative_to(app).as_posix(),
                                                     "error": "Required runtime is not Mach-O"}])

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
                     "node_modules/@koromix/koffi-darwin-x64/koffi.node",
                     "node_modules/@other/reflink-win32-x64-msvc/reflink.win32-x64-msvc.node",
                     "node_modules/@reflink/reflink-win32-x64-msvc/unknown.node",
                     "node_modules/@reflink/reflink-darwin-x64/reflink.darwin-x64.node"):
            self.assertFalse(module.foreign_prebuild(Path(path)), path)

    def test_otool_parenthesized_helper_uses_identical_temporary_file(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "Agent Pi DSH Helper (GPU)"
            content = bytes.fromhex("cffaedfe") + b"original helper bytes"
            source.write_bytes(content)
            for force_copy in (False, True):
                with self.subTest(copyFallback=force_copy):
                    observed = []

                    def run(command, **options):
                        alias = Path(command[-1])
                        self.assertNotEqual(alias, source)
                        self.assertNotIn("(", str(alias))
                        self.assertNotIn(")", str(alias))
                        self.assertEqual(alias.read_bytes(), content)
                        self.assertEqual(command[:-1], ["otool", "-arch", "x86_64", "-l"])
                        observed.append(alias)
                        return CompletedProcess(command, 0, modern("13.0"), "")

                    copy_context = patch.object(module.os, "link", side_effect=OSError("cross-device")) if force_copy else nullcontext()
                    with copy_context, patch.object(module.subprocess, "run", side_effect=run):
                        output = module.tool("otool", "-arch", "x86_64", "-l", str(source))
                    self.assertEqual(source.read_bytes(), content)
                    self.assertFalse(observed[0].exists())
                    with self.assertRaisesRegex(ValueError, "13.0 exceeds 12.0"):
                        module.validate_slice("x86_64", output, "12.0")

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
