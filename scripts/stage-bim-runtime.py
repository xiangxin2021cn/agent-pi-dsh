"""Copy an installed Windows engine to a relocatable, private-test runtime.

No installs, downloads, or changes to the source interpreter. Invoke with the
explicit source python.exe -I. Public redistribution requires a separate review.
"""
import argparse
import hashlib
import importlib.metadata as metadata
import json
from pathlib import Path
import shutil
import sys

VERSIONS = {
    "ifcopenshell": "0.8.5", "numpy": "2.4.3", "shapely": "2.1.1",
    "isodate": "0.7.2", "python-dateutil": "2.9.0.post0", "lark": "1.2.2",
    "typing-extensions": "4.15.0", "six": "1.17.0",
}
CORE = "1c5b825d8ef05ab9d14a15dac12e9eae2f5a37c2"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    parser.add_argument("--license-dir", required=True)
    args = parser.parse_args()
    if sys.platform != "win32" or sys.version_info[:3] != (3, 13, 7):
        raise RuntimeError("This recipe is verified only for Windows CPython 3.13.7 x64")
    import struct
    import ifcopenshell
    if struct.calcsize("P") != 8 or ifcopenshell.version_core != "0.8.5-1c5b825":
        raise RuntimeError("Unexpected interpreter architecture or IfcOpenShell core")
    prefix, output = Path(sys.base_prefix).resolve(), Path(args.output).resolve()
    if output.exists() or output == prefix or prefix in output.parents:
        raise RuntimeError("Output must be a new directory outside the source Python")
    licenses = Path(args.license_dir).resolve()
    sources = json.loads((licenses / "sources.json").read_text(encoding="utf-8-sig"))
    for entry in sources:
        data = (licenses / entry["file"]).read_bytes()
        if hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise RuntimeError("License evidence changed: " + entry["file"])
    if not {"COPYING", "COPYING.LESSER", "win-build-deps.cmd"}.issubset({e["file"] for e in sources}):
        raise RuntimeError("Missing official IfcOpenShell license/build evidence")
    distributions = [metadata.distribution(name) for name in VERSIONS]
    for name, dist in zip(VERSIONS, distributions):
        if dist.version != VERSIONS[name]:
            raise RuntimeError("Unreviewed dependency version: " + name + " " + dist.version)
    python = output / "python"
    python.mkdir(parents=True)
    for source in prefix.iterdir():
        if source.is_file() and (source.suffix.lower() == ".dll" or source.name in {"python.exe", "LICENSE.txt"}):
            shutil.copy2(source, python / source.name)
    excluded = {"site-packages", "test", "turtledemo", "idlelib", "tkinter", "ensurepip", "__pycache__"}
    shutil.copytree(prefix / "Lib", python / "Lib", ignore=lambda directory, names: [n for n in names if n in excluded or n.endswith(".pyc")])
    shutil.copytree(prefix / "DLLs", python / "DLLs", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    components = []
    site = (prefix / "Lib/site-packages").resolve()
    for name, dist in zip(VERSIONS, distributions):
        copied, component_licenses = 0, []
        for record in dist.files or []:
            source = Path(dist.locate_file(record)).resolve()
            if not source.is_relative_to(site) or not source.is_file() or "__pycache__" in source.parts:
                continue  # Console scripts are not part of this isolated engine.
            target = python / "Lib/site-packages" / source.relative_to(site)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            copied += source.stat().st_size
            if any(token in source.name.lower() for token in ("license", "copying", "notice")):
                component_licenses.append(target.relative_to(output).as_posix())
        components.append({"name": name, "version": dist.version, "bytes": copied,
                           "source": "https://pypi.org/project/" + name + "/" + dist.version + "/",
                           "licenses": component_licenses})
    # Windows isolated path file: never resolve stdlib/site-packages via registry,
    # PATH, PYTHONHOME, PYTHONPATH, user site, or the original development install.
    (python / "python313._pth").write_text(".\nLib\nDLLs\nLib/site-packages\nimport site\n", encoding="utf-8")
    shutil.copytree(licenses, output / "licenses/IfcOpenShell")
    notice = """# Optional BIM engine: private local validation only

This runtime contains an unmodified CPython 3.13.7 and IfcOpenShell 0.8.5
(core 0.8.5-1c5b825), copied from the explicitly selected local installation.
All copied Python distribution metadata and license files are retained.

IfcOpenShell is LGPL-3.0-or-later; COPYING.LESSER and its required GPL COPYING
are included with exact official source URLs and hashes. Windows upstream build
instructions include CGAL (partly GPL), OCCT, MPIR/MPFR and other native code.
The Python wheel's metadata alone does not establish the exact compiled native
dependency closure. The native dependency inventory, notices, complete
corresponding source/build inputs and redistribution method remain unverified.
This staging is NOT approved for public redistribution. A local cold-start test
is technical evidence only and does not clear the public redistribution gate.

Exact IfcOpenShell source and build scripts:
https://github.com/IfcOpenShell/IfcOpenShell/tree/CORE_COMMIT
https://github.com/IfcOpenShell/IfcOpenShell/archive/CORE_COMMIT.tar.gz
CPython source: https://www.python.org/downloads/release/python-3137/
Maintainer dependency discussion: https://github.com/IfcOpenShell/IfcOpenShell/discussions/9298

The engine runs in an independent process. Users can replace this entire runtime
directory or set AGENT_PI_BIM_PYTHON_PATH to a compatible interpreter; no engine
signature check or technical lock prevents replacement. Disabling/uninstalling
the engineering-bim plugin removes its use. Public distributors must fulfill all
applicable LGPL/GPL obligations, including appropriate corresponding-source and
relink/replacement provisions; separate process use does not remove them.
""".replace("CORE_COMMIT", CORE)
    (output / "RUNTIME-NOTICE.md").write_text(notice, encoding="utf-8")
    files = []
    for path in sorted(output.rglob("*")):
        if path.is_file():
            files.append({"path": path.relative_to(output).as_posix(), "bytes": path.stat().st_size,
                          "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    receipt = {"schemaVersion": 1, "platform": "win32-x64", "pythonVersion": "3.13.7",
               "ifcopenshellVersion": "0.8.5", "coreVersion": "0.8.5-1c5b825", "coreCommit": CORE,
               "redistribution": "license-review-required", "components": components, "files": files}
    (output / "BIM-RUNTIME-RECEIPT.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"runtime": str(output), "files": len(files), "bytes": sum(f["bytes"] for f in files),
                      "redistribution": receipt["redistribution"]}))


if __name__ == "__main__":
    main()
