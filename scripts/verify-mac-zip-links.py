"""Verify release ZIP symlinks before and after system Archive Utility extraction."""
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import stat
import sys
import zipfile

APP = "Agent Pi DSH.app"


def inspect_zip(archive, extracted=None):
    links = {}
    with zipfile.ZipFile(archive) as package:
        for entry in package.infolist():
            path = PurePosixPath(entry.filename)
            if path.is_absolute() or ".." in path.parts or "\\" in entry.filename:
                raise ValueError("Unsafe ZIP entry: " + entry.filename)
            if not path.parts or path.parts[0] not in (APP, "__MACOSX"):
                raise ValueError("Unexpected ZIP root: " + entry.filename)
            if stat.S_ISLNK(entry.external_attr >> 16):
                if path.parts[0] != APP or entry.compress_type != zipfile.ZIP_STORED:
                    raise ValueError("Symlink must use ZIP_STORED method 0: " + entry.filename)
                target = package.read(entry).decode("utf-8")
                resolved = posixpath.normpath(posixpath.join(posixpath.dirname(entry.filename), target))
                if not target or target.startswith("/") or "\\" in target or not resolved.startswith(APP + "/"):
                    raise ValueError("Symlink escapes application: " + entry.filename)
                if entry.filename in links:
                    raise ValueError("Duplicate symlink: " + entry.filename)
                links[entry.filename] = target
    if not links:
        raise ValueError("Expected packaged application symlinks")
    checked = 0
    if extracted is not None:
        parent = Path(extracted)
        for name, target in links.items():
            actual = parent.joinpath(*PurePosixPath(name).parts)
            if not actual.is_symlink() or os.readlink(actual) != target:
                raise ValueError("Extracted symlink target differs: " + name)
        app = parent / APP
        if not app.is_dir() or app.is_symlink():
            raise ValueError("Missing extracted application directory")
        for root, directories, files in os.walk(app, followlinks=False):
            for item in [Path(root)] + [Path(root) / name for name in directories + files]:
                mode = item.lstat().st_mode
                if stat.S_ISLNK(mode):
                    continue
                expected = (0o755,) if stat.S_ISDIR(mode) else (0o644, 0o755)
                if not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)) or stat.S_IMODE(mode) not in expected:
                    raise ValueError("Unexpected application permissions: " + str(item))
                checked += 1
    return {"passed": True, "symlinks": len(links), "allSymlinksStored": True,
            "extractedTargetsVerified": extracted is not None, "permissionEntriesChecked": checked}


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        raise SystemExit("Usage: verify-mac-zip-links.py <zip> [system-extraction-parent]")
    print(json.dumps(inspect_zip(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else None)))
