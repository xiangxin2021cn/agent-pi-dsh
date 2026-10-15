"""Check the packaged Intel app's actual Mach-O deployment targets on macOS.

Run after electron-builder, before publishing. This does not rewrite binaries
and cannot replace a launch test on a real Monterey installation.
"""
import argparse
from contextlib import ExitStack
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile


MACHO_MAGICS = {bytes.fromhex(value) for value in (
    "feedface", "cefaedfe", "feedfacf", "cffaedfe",
    "cafebabe", "bebafeca", "cafebabf", "bfbafeca")}


def version_tuple(value):
    if not re.fullmatch(r"\d+(?:\.\d+){0,2}", value):
        raise ValueError("Invalid macOS version: " + value)
    parts = tuple(map(int, value.split(".")))
    return parts + (0,) * (3 - len(parts))


def parse_minimum_versions(output):
    """Parse only deployment targets, never the build SDK version."""
    versions = []
    for block in re.split(r"(?m)^\s*Load command \d+\s*$", output):
        if re.search(r"\bcmd LC_BUILD_VERSION\b", block):
            platform = re.search(r"(?m)^\s*platform\s+(\S+)", block)
            if not platform or platform.group(1).lower() not in {"1", "macos"}:
                raise ValueError("LC_BUILD_VERSION is not a macOS load command")
            match = re.search(r"(?m)^\s*minos\s+(\S+)", block)
        elif re.search(r"\bcmd LC_VERSION_MIN_MACOSX\b", block):
            match = re.search(r"(?m)^\s*version\s+(\S+)", block)
        else:
            continue
        if not match:
            raise ValueError("Mach-O minimum macOS version is missing")
        version_tuple(match.group(1))
        versions.append(match.group(1))
    if not versions:
        raise ValueError("Mach-O has no minimum macOS load command")
    return versions


def validate_slice(architectures, load_commands, maximum):
    if "x86_64" not in architectures.split():
        raise ValueError("Missing x86_64 slice: " + architectures.strip())
    versions = parse_minimum_versions(load_commands)
    minimum = max(versions, key=version_tuple)
    if version_tuple(minimum) > version_tuple(maximum):
        raise ValueError(f"Minimum macOS {minimum} exceeds {maximum}")
    return minimum


def foreign_prebuild(path):
    """Allow only named foreign platform directories inside node_modules."""
    if "node_modules" not in path.parts:
        return False
    for part in path.parts:
        # Handles prebuilds/darwin-arm64 and optional npm platform packages.
        match = re.search(r"(?:^|[-+])((?:darwin|linux|win32|freebsd|openbsd|android|aix)-[a-z0-9_]+)(?:$|@)", part)
        if match and match.group(1) != "darwin-x64":
            return True
    return False


def tool(*args):
    with ExitStack() as temporary:
        command = list(args)
        # otool-classic interprets a trailing parenthesis as archive(member),
        # even for an existing Helper (GPU) executable. Read identical bytes
        # under a temporary plain filename, keeping report paths untouched.
        if command[0] == "otool" and any(char in command[-1] for char in "()"):
            directory = temporary.enter_context(tempfile.TemporaryDirectory(
                prefix="agent-pi-macho-", dir="/tmp" if sys.platform == "darwin" else None))
            alias = Path(directory) / "binary"
            try:
                os.link(command[-1], alias)
            except OSError:
                shutil.copyfile(command[-1], alias)
            command[-1] = str(alias)
        result = subprocess.run(command, text=True, capture_output=True, check=False)
    if result.returncode:
        raise ValueError(f"{' '.join(args)}: {result.stderr.strip() or result.stdout.strip()}")
    return result.stdout


def inspect_app(app, maximum):
    app = Path(app).resolve(strict=True)
    report = {"app": str(app), "architecture": "x86_64", "maximumMacOS": maximum,
              "checkedFiles": [], "ignoredForeignPrebuilds": [], "errors": [],
              "limitation": "Static deployment-target validation; Monterey hardware launch remains required."}
    info = app / "Contents/Info.plist"
    with info.open("rb") as stream:
        plist = plistlib.load(stream)
    executable = plist.get("CFBundleExecutable")
    if not executable or Path(executable).name != executable:
        raise ValueError("Invalid main CFBundleExecutable")
    required = {
        app / "Contents/MacOS" / executable,
        app / "Contents/Resources/runtime/node/node",
        app / "Contents/Resources/runtime/product/bundles/project-plan/runtime/jre/bin/java",
    }
    seen_required = set()
    seen_real = set()
    for directory, directories, names in os.walk(app, followlinks=False):
        links = [name for name in directories if (Path(directory) / name).is_symlink()]
        for name in sorted(names + links):
            path = Path(directory) / name
            relative = path.relative_to(app).as_posix()
            try:
                real = path.resolve(strict=True)
            except (OSError, RuntimeError) as error:
                report["errors"].append({"path": relative, "error": f"Cannot resolve packaged path: {error}"})
                continue
            if not real.is_relative_to(app):
                report["errors"].append({"path": relative, "error": "File symlink escapes app"})
                continue
            if path.is_dir():
                continue
            if name == "Info.plist":
                try:
                    with path.open("rb") as stream:
                        values = plistlib.load(stream)
                    targets = [values.get("LSMinimumSystemVersion")]
                    targets.append(values.get("LSMinimumSystemVersionByArchitecture", {}).get("x86_64"))
                    for target in filter(None, targets):
                        if version_tuple(target) > version_tuple(maximum):
                            raise ValueError(f"Info.plist minimum macOS {target} exceeds {maximum}")
                except (ValueError, plistlib.InvalidFileException) as error:
                    report["errors"].append({"path": relative, "error": str(error)})
            if foreign_prebuild(Path(relative)):
                if path.suffix == ".node" or path.suffix == ".dylib" or os.access(path, os.X_OK):
                    report["ignoredForeignPrebuilds"].append(relative)
                continue
            if real in seen_real:
                if path in required:
                    seen_required.add(path)
                continue
            seen_real.add(real)
            with path.open("rb") as stream:
                magic = stream.read(4)
            # Java .class files use the same magic as a fat Mach-O.
            if magic not in MACHO_MAGICS or path.suffix == ".class":
                if path in required or path.suffix == ".node":
                    report["errors"].append({"path": relative, "error": "Required runtime is not Mach-O"})
                continue
            row = {"path": relative}
            try:
                architectures = tool("lipo", "-archs", str(path)).strip()
                row["architectures"] = architectures.split()
                if "x86_64" not in row["architectures"]:
                    raise ValueError("Missing x86_64 slice: " + architectures)
                commands = tool("otool", "-arch", "x86_64", "-l", str(path))
                # Relocatable object files are build inputs, not runtime code.
                header = tool("otool", "-arch", "x86_64", "-hv", str(path))
                if re.search(r"\bOBJECT\b", header):
                    continue
                versions = parse_minimum_versions(commands)
                row["minimumMacOS"] = max(versions, key=version_tuple)
                validate_slice(architectures, commands, maximum)
                seen_required.add(path)
            except ValueError as error:
                report["errors"].append({"path": relative, "error": str(error)})
            report["checkedFiles"].append(row)
    for path in sorted(required - seen_required):
        if not any(row["path"] == path.relative_to(app).as_posix() for row in report["errors"]):
            report["errors"].append({"path": path.relative_to(app).as_posix(), "error": "Required runtime missing or unchecked"})
    if not report["checkedFiles"]:
        report["errors"].append({"path": ".", "error": "No Mach-O runtimes checked"})
    report["passed"] = not report["errors"]
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app", help="Path to the final packaged .app")
    parser.add_argument("--maximum-macos", default="12.0")
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    version_tuple(args.maximum_macos)
    if sys.platform != "darwin":
        parser.error("Actual scanning requires macOS lipo and otool")
    report = inspect_app(args.app, args.maximum_macos)
    destination = Path(args.report)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Intel macOS check: {len(report['checkedFiles'])} binaries, {len(report['errors'])} errors; report: {destination}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
