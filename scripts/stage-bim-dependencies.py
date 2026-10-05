"""Assemble the Windows BIM dependency base from immutable upstream archives.

This does not install packages, use the host's site-packages, include IfcOpenShell,
or approve public redistribution. The release recipe supplies the separately
reviewed IFC engine, native libraries, notices and corresponding source.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import zipfile

PTH = b"python313.zip\n.\nLib/site-packages\nimport site\n"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def checked_archive(materials, artifact):
    name = artifact["file"]
    if Path(name).name != name or "/" in name or "\\" in name:
        raise ValueError("Archive name must be a basename")
    path = Path(materials) / name
    data = path.read_bytes()
    if len(data) != artifact["bytes"] or digest(data) != artifact["sha256"]:
        raise ValueError("Archive hash or size mismatch: " + name)
    return path


def unpack_archive(path, destination, output, files):
    with zipfile.ZipFile(path) as archive:
        for entry in archive.infolist():
            name = PurePosixPath(entry.filename)
            if entry.is_dir():
                continue
            if name.is_absolute() or ".." in name.parts or "\\" in entry.filename or ":" in entry.filename:
                raise ValueError("Unsafe archive member: " + entry.filename)
            target = destination / name
            if target.exists():
                raise ValueError("Duplicate archive member: " + entry.filename)
            target.parent.mkdir(parents=True, exist_ok=True)
            data = archive.read(entry)
            target.write_bytes(data)
            files.append({"path": target.relative_to(output).as_posix(), "bytes": len(data),
                          "sha256": digest(data), "sourceArchive": path.name,
                          "sourcePath": entry.filename})


def stage_dependency_base(pins, materials, output):
    output = Path(output).resolve()
    if output.exists():
        raise ValueError("Output must be a new directory")
    archives = [(checked_archive(materials, pins["python"]["archive"]), output / "python")]
    for package in pins["packages"]:
        archives.append((checked_archive(materials, package["wheel"]), output / "python/Lib/site-packages"))
    files = []
    for archive, destination in archives:
        unpack_archive(archive, destination, output, files)
    pth = output / "python/python313._pth"
    pth.write_bytes(PTH)
    files = [row for row in files if row["path"] != "python/python313._pth"]
    files.append({"path": "python/python313._pth", "bytes": len(PTH), "sha256": digest(PTH),
                  "sourceArchive": None, "sourcePath": None,
                  "change": "Restrict module lookup to embedded stdlib and explicitly bundled wheel directory."})
    manifest = {"schema": "agent-pi-dsh/bim-dependency-base/v1", "platform": "win32-x64",
                "publicReleaseReviewed": False, "pins": pins,
                "files": sorted(files, key=lambda row: row["path"])}
    (output / "DEPENDENCY-BASE-MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--materials", required=True, help="Directory containing the pinned upstream archives")
    parser.add_argument("--output", required=True, help="New directory for the dependency base")
    args = parser.parse_args()
    pins = json.loads(Path(__file__).with_name("bim-dependencies.pins.json").read_text(encoding="utf-8"))
    manifest = stage_dependency_base(pins, args.materials, args.output)
    print(json.dumps({"output": str(Path(args.output).resolve()), "files": len(manifest["files"]),
                      "publicReleaseReviewed": False}))


if __name__ == "__main__":
    main()
