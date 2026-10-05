"""Bounded IFC worker. JSON in/out only; tested with IfcOpenShell 0.8.5.

Geometry is triangulated SI geometry, never an IFC authoring quantity or a
contract measurement. All outputs await human engineering review.
"""
import hashlib
import json
import math
from pathlib import Path
import sys
from collections import Counter

ALGORITHM = "ifc-bim-v1"
MAX_FILE = 256 * 1024 * 1024


def issue(code, message, global_id=None, severity="warning"):
    result = {"code": code, "severity": severity, "message": message}
    if global_id:
        result["globalId"] = global_id
    return result


def sha(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def bounded_int(value, default, minimum, maximum, label):
    if value is None:
        return default
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(f"{label} must be an integer in {minimum}..{maximum}")
    return value


def scoped(root, value, output=False):
    if not isinstance(value, str) or not value:
        raise ValueError("IFC path is required")
    candidate = root / value
    path = candidate.parent.resolve(strict=True) / candidate.name if output else candidate.resolve(strict=True)
    if not path.is_relative_to(root) or path.suffix.lower() != ".ifc":
        raise ValueError("IFC path is outside session cwd or has an unsupported extension")
    if output:
        if path.exists() or path.is_symlink():
            raise ValueError("Output already exists; source and existing artifacts cannot be overwritten")
    elif not path.is_file() or path.stat().st_size > MAX_FILE:
        raise ValueError("IFC input must be a file within the 256 MiB budget")
    return path


def clean(value, depth=0):
    if depth > 6:
        return "[nested value omitted]"
    if value is None or isinstance(value, (str, bool, int)):
        return value[:2000] if isinstance(value, str) else value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(k): clean(v, depth + 1) for k, v in list(value.items())[:100]}
    if isinstance(value, (list, tuple)):
        return [clean(v, depth + 1) for v in value[:100]]
    if hasattr(value, "get_info"):
        return clean(value.get_info(), depth + 1)
    return str(value)[:2000]


def unit_info(model):
    from ifcopenshell.util.unit import calculate_unit_scale
    assignment = model.by_type("IfcUnitAssignment")
    units = [clean(unit.get_info()) for unit in assignment[0].Units] if assignment else []
    length_units = [u for u in (assignment[0].Units if assignment else []) if getattr(u, "UnitType", None) == "LENGTHUNIT"]
    scale = calculate_unit_scale(model) if len(length_units) == 1 else None
    return {"declared": units, "lengthToMeters": scale, "geometryUnits": {"length": "m", "area": "m2", "volume": "m3"}}


def coordinate_info(model):
    def by_type(name):
        try:
            return model.by_type(name)
        except RuntimeError:
            return []
    contexts = [{"stepId": c.id(), "dimension": c.CoordinateSpaceDimension, "precision": c.Precision,
                 "worldCoordinateSystem": clean(c.WorldCoordinateSystem), "trueNorth": clean(c.TrueNorth)}
                for c in model.by_type("IfcGeometricRepresentationContext") if not c.is_a("IfcGeometricRepresentationSubContext")]
    return {"contexts": contexts, "projectedCRS": [clean(v) for v in by_type("IfcProjectedCRS")],
            "mapConversions": [clean(v) for v in by_type("IfcMapConversion")],
            "geometryFrame": "IFC engineering world placement in metres; map conversion not applied; no assumed CRS"}


def reference(entity):
    return {"globalId": getattr(entity, "GlobalId", None), "stepId": entity.id(), "type": entity.is_a(), "name": getattr(entity, "Name", None)}


def elements(model, request):
    values = [v for v in model.by_type("IfcElement") if not v.is_a("IfcFeatureElement")]
    types = request.get("types")
    ids = request.get("globalIds")
    for selected, name in ((types, "types"), (ids, "globalIds")):
        if selected is not None and (not isinstance(selected, list) or len(selected) > 100 or any(not isinstance(v, str) or not v for v in selected)):
            raise ValueError(f"{name} must be a list of at most 100 strings")
    if types:
        values = [v for v in values if any(v.is_a(t) for t in types)]
    if ids:
        values = [v for v in values if v.GlobalId in ids]
    values.sort(key=lambda v: v.id())
    return values


def native_quantities(element, source_hash):
    from ifcopenshell.util.element import get_type
    quantities = []
    sets = []
    for relation in getattr(element, "IsDefinedBy", []):
        if not relation.is_a("IfcRelDefinesByProperties"):
            continue
        qset = relation.RelatingPropertyDefinition
        if not qset.is_a("IfcElementQuantity"):
            continue
        sets.append((qset, "instance"))
    element_type = get_type(element)
    if element_type:
        sets.extend((qset, "type") for qset in (getattr(element_type, "HasPropertySets", None) or []) if qset.is_a("IfcElementQuantity"))
    for qset, assignment in sets:
        for quantity in qset.Quantities:
            info = quantity.get_info()
            value_keys = [k for k in info if k.endswith("Value")]
            quantities.append({"set": qset.Name, "name": quantity.Name, "type": quantity.is_a(), "assignment": assignment,
                               "globalId": element.GlobalId, "sourceSha256": source_hash, "algorithmVersion": ALGORITHM,
                               "value": clean(info[value_keys[0]]) if value_keys else None,
                               "unit": clean(getattr(quantity, "Unit", None)), "unitBasis": "explicit quantity unit or project unit of this measure type",
                               "origin": "native_ifc_qto", "methodOfMeasurement": qset.MethodOfMeasurement,
                               "formula": getattr(quantity, "Formula", None), "reviewStatus": "needs_review"})
    return quantities


def query_row(element, scale, source_hash):
    from ifcopenshell.util.element import get_container, get_psets
    from ifcopenshell.util.placement import get_local_placement
    container = get_container(element)
    placement = get_local_placement(element.ObjectPlacement).tolist() if element.ObjectPlacement else None
    return {**reference(element), "container": reference(container) if container else None,
            "placementProjectUnits": placement,
            "positionMeters": [placement[i][3] * scale for i in range(3)] if placement and scale else None,
            "properties": clean(get_psets(element, psets_only=True)), "nativeQuantities": native_quantities(element, source_hash),
            "hasRepresentation": bool(element.Representation), "openingCount": len(getattr(element, "HasOpenings", []))}


def mesh_data(element, disable_openings=False):
    import ifcopenshell.geom
    import numpy as np
    settings = ifcopenshell.geom.settings()
    settings.set("use-world-coords", True)
    settings.set("weld-vertices", True)
    settings.set("convert-back-units", False)
    settings.set("disable-opening-subtractions", disable_openings)
    settings.set("mesher-linear-deflection", 0.001)
    settings.set("mesher-angular-deflection", 0.5)
    shape = ifcopenshell.geom.create_shape(settings, element)
    vertices = np.array(shape.geometry.verts, dtype=float).reshape((-1, 3))
    faces = np.array(shape.geometry.faces, dtype=int).reshape((-1, 3))
    if not len(vertices) or not len(faces) or not np.isfinite(vertices).all():
        raise ValueError("Empty or non-finite geometry")
    return vertices, faces


def metrics(vertices, faces):
    import numpy as np
    edges = Counter()
    oriented = Counter()
    for face in faces:
        for a, b in ((int(face[0]), int(face[1])), (int(face[1]), int(face[2])), (int(face[2]), int(face[0]))):
            edge = (min(a, b), max(a, b))
            edges[edge] += 1
            oriented[edge] += 1 if a < b else -1
    closed = all(v == 2 for v in edges.values()) and all(v == 0 for v in oriented.values())
    shifted = vertices - vertices.mean(axis=0) # Avoid georeferenced coordinate cancellation.
    triangle = shifted[faces]
    cross = np.cross(triangle[:, 1] - triangle[:, 0], triangle[:, 2] - triangle[:, 0])
    area = float(np.linalg.norm(cross, axis=1).sum() / 2)
    volume = abs(float(np.einsum("ij,ij->i", triangle[:, 0], np.cross(triangle[:, 1], triangle[:, 2])).sum() / 6)) if closed else None
    if volume is not None and volume <= 1e-12:
        volume = None
    return {"closedOrientedMesh": closed, "volumeM3": volume, "surfaceAreaM2": area,
            "bboxMeters": {"min": vertices.min(axis=0).tolist(), "max": vertices.max(axis=0).tolist()}}


def geometry_rows(values, request, source, units):
    rows, issues, triangle_count = [], [], 0
    limit = bounded_int(request.get("maxTriangles"), 20000 if request["action"] == "preview" else 50000, 1, 50000, "maxTriangles")
    for element in values:
        row = {**reference(element), "sourceSha256": source["sha256"], "origin": "triangulated_geometry", "reviewStatus": "needs_review", "algorithmVersion": ALGORITHM,
               "formula": "oriented closed triangles: abs(sum(dot(a,cross(b,c)))/6); surface=sum(norm(cross(b-a,c-a)))/2",
               "openingCount": len(getattr(element, "HasOpenings", [])), "status": "failed", "netVolumeM3": None, "grossVolumeM3": None, "openingVolumeM3": None}
        try:
            if units["lengthToMeters"] is None:
                raise ValueError("No unique declared length unit; scale must be confirmed before geometry")
            vertices, faces = mesh_data(element)
            if triangle_count + len(faces) > limit:
                raise ValueError("Triangle budget exceeded; narrow the element selection")
            triangle_count += len(faces)
            measured = metrics(vertices, faces)
            row["netVolumeM3"] = measured.pop("volumeM3")
            row.update(measured)
            row["status"] = "measured" if row["netVolumeM3"] is not None else "needs_review"
            if row["netVolumeM3"] is None:
                issues.append(issue("geometry-not-closed", "Volume unavailable: mesh is not a closed oriented nonzero solid", element.GlobalId))
            if row["openingCount"]:
                gross_vertices, gross_faces = mesh_data(element, True)
                if triangle_count + len(gross_faces) > limit:
                    raise ValueError("Gross/opening verification exceeds triangle budget")
                triangle_count += len(gross_faces)
                gross = metrics(gross_vertices, gross_faces)["volumeM3"]
                row["grossVolumeM3"] = gross
                if gross is not None and row["netVolumeM3"] is not None:
                    delta = gross - row["netVolumeM3"]
                    row["openingVolumeM3"] = delta if delta > 1e-10 else None
                if row["openingVolumeM3"] is None:
                    row["status"] = "needs_review"
                    issues.append(issue("opening-unverified", "Declared opening subtraction could not be established; inspect original opening geometry", element.GlobalId))
                row["openingVerification"] = "aggregate_subtraction_only"
                if row["openingCount"] > 1:
                    row["status"] = "needs_review"
                    issues.append(issue("individual-openings-unverified", "Multiple opening subtraction is aggregate only; each opening and overlap still requires review", element.GlobalId))
            else:
                row["grossVolumeM3"] = row["netVolumeM3"]
                row["openingVolumeM3"] = 0
            if request["action"] == "preview":
                origin = vertices.mean(axis=0)
                row["mesh"] = {"originMeters": origin.tolist(), "vertices": (vertices - origin).reshape(-1).tolist(), "triangles": faces.reshape(-1).tolist(), "unit": "m"}
        except Exception as error:
            row["status"] = "failed"
            # Failed opening/geometry analysis is not a zero quantity.
            row["netVolumeM3"] = row["grossVolumeM3"] = row["openingVolumeM3"] = None
            issues.append(issue("geometry-failed", str(error), element.GlobalId, "error"))
        rows.append(row)
    return rows, issues, triangle_count


def prism(model, body, component, ifc_class=None):
    import ifcopenshell.api.root
    import ifcopenshell.api.geometry
    import numpy as np
    length, width, height = component["sizeMeters"]
    profile_position = model.create_entity("IfcAxis2Placement2D", Location=model.create_entity("IfcCartesianPoint", Coordinates=(length / 2, width / 2)))
    profile = model.create_entity("IfcRectangleProfileDef", ProfileType="AREA", Position=profile_position, XDim=length, YDim=width)
    solid = model.create_entity("IfcExtrudedAreaSolid", SweptArea=profile,
                                Position=model.create_entity("IfcAxis2Placement3D", Location=model.create_entity("IfcCartesianPoint", Coordinates=(0., 0., 0.))),
                                ExtrudedDirection=model.create_entity("IfcDirection", DirectionRatios=(0., 0., 1.)), Depth=height)
    representation = model.create_entity("IfcShapeRepresentation", ContextOfItems=body, RepresentationIdentifier="Body", RepresentationType="SweptSolid", Items=[solid])
    product = ifcopenshell.api.root.create_entity(model, ifc_class=ifc_class or component["type"], name=component["name"])
    product.Tag = component["id"]
    product.Representation = model.create_entity("IfcProductDefinitionShape", Representations=[representation])
    angle = math.radians(component.get("rotationDegrees", 0))
    matrix = np.eye(4)
    matrix[:3, :3] = [[math.cos(angle), -math.sin(angle), 0], [math.sin(angle), math.cos(angle), 0], [0, 0, 1]]
    matrix[:3, 3] = component["positionMeters"]
    ifcopenshell.api.geometry.edit_object_placement(model, product=product, matrix=matrix, is_si=True)
    return product


def generate(root, request, result):
    import ifcopenshell
    import ifcopenshell.api.project
    import ifcopenshell.api.root
    import ifcopenshell.api.unit
    import ifcopenshell.api.context
    import ifcopenshell.api.aggregate
    import ifcopenshell.api.spatial
    path = scoped(root, request.get("outputPath"), True)
    components = request.get("components")
    if not isinstance(components, list) or not 1 <= len(components) <= 200:
        raise ValueError("Generate requires 1..200 explicit components")
    seen = set()
    for component in components:
        if not isinstance(component, dict) or component.get("type") not in ("IfcBeam", "IfcSlab", "IfcBuildingElementProxy"):
            raise ValueError("Only rectangular IfcBeam/IfcSlab/IfcBuildingElementProxy are supported")
        if not isinstance(component.get("id"), str) or not component["id"] or component["id"] in seen or not isinstance(component.get("name"), str):
            raise ValueError("Every component requires a unique id and explicit name")
        seen.add(component["id"])
        for field in ("sizeMeters", "positionMeters"):
            values = component.get(field)
            if not isinstance(values, list) or len(values) != 3 or any(type(v) not in (int, float) or not math.isfinite(v) or abs(v) > 1e8 or (field == "sizeMeters" and v <= 0) for v in values):
                raise ValueError(f"{field} requires three finite explicit metre values; dimensions must be positive")
        angle = component.get("rotationDegrees", 0)
        if type(angle) not in (int, float) or not math.isfinite(angle) or abs(angle) > 360:
            raise ValueError("rotationDegrees must be finite within -360..360")
    model = ifcopenshell.api.project.create_file(version="IFC4")
    project = ifcopenshell.api.root.create_entity(model, ifc_class="IfcProject", name=str(request.get("projectName") or "Engineering model"))
    units = [ifcopenshell.api.unit.add_si_unit(model, unit_type=t) for t in ("LENGTHUNIT", "AREAUNIT", "VOLUMEUNIT")]
    ifcopenshell.api.unit.assign_unit(model, units=units)
    context = ifcopenshell.api.context.add_context(model, context_type="Model")
    body = ifcopenshell.api.context.add_context(model, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=context)
    site = ifcopenshell.api.root.create_entity(model, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuilding", name="Engineering works")
    storey = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBuildingStorey", name="Model level")
    for parent, child in ((project, site), (site, building), (building, storey)):
        ifcopenshell.api.aggregate.assign_object(model, products=[child], relating_object=parent)
    created = []
    for component in components:
        product = prism(model, body, component)
        ifcopenshell.api.spatial.assign_container(model, products=[product], relating_structure=storey)
        created.append({**reference(product), "inputId": component["id"], "parameters": component})
    text = model.to_string()
    # Parse before publication; exclusive creation prevents concurrent overwrites.
    ifcopenshell.file.from_string(text)
    with open(path, "x", encoding="utf-8", newline="\n") as stream:
        stream.write(text)
    result.update({"source": {"path": str(path), "sha256": sha(path), "schema": model.schema}, "created": created,
                   "units": unit_info(model), "coordinates": coordinate_info(model)})
    result["issues"].append(issue("parametric-scope", "Rectangular prisms only; no reinforcement, road alignment, terrain, joints, connections or structural design. Explicit dimensions require source review."))
    return result


def main(payload):
    request = payload["request"]
    action = request.get("action")
    if action not in ("health", "inventory", "query", "geometry", "preview", "generate"):
        raise ValueError("Unknown BIM action")
    result = {"schemaVersion": 1, "action": action, "engine": {"name": "IfcOpenShell", "version": "", "available": False},
              "algorithmVersion": ALGORITHM, "reviewStatus": "needs_review", "issues": []}
    try:
        import ifcopenshell
        import ifcopenshell.geom
        result["engine"].update({"version": ifcopenshell.version, "available": True, "pythonExecutable": sys.executable, "pythonVersion": sys.version.split()[0]})
    except Exception as error:
        if action != "health":
            raise ValueError(f"IfcOpenShell unavailable in configured Python: {error}")
        result["issues"].append(issue("engine-unavailable", str(error), severity="error"))
        return result
    if action == "health":
        result["capabilities"] = ["ifc-inventory", "native-qto-query", "triangulated-geometry", "bounded-preview-mesh", "rectangular-prism-generation"]
        result["budgets"] = {"fileBytes": MAX_FILE, "queryElements": 100, "geometryElements": 20, "triangles": 50000, "generatedElements": 200, "hostTimeoutMaximumMs": 120000}
        return result
    root = Path(payload["cwd"]).resolve(strict=True)
    if action == "generate":
        return generate(root, request, result)
    path = scoped(root, request.get("sourcePath"))
    source_hash = sha(path)
    if source_hash != str(request.get("expectedSha256", "")).lower():
        raise ValueError("IFC source SHA-256 differs from the registered version; review the change before reading")
    model = ifcopenshell.open(path)
    source = {"path": str(path), "sha256": source_hash, "schema": model.schema}
    units = unit_info(model)
    result.update({"source": source, "units": units, "coordinates": coordinate_info(model)})
    if units["lengthToMeters"] is None:
        result["issues"].append(issue("units-unknown", "A unique project length unit is missing; geometry quantities cannot be accepted", severity="error"))
    values = elements(model, request)
    if not values:
        result["issues"].append(issue("selection-empty", "No physical elements matched; this is not evidence of complete model or drawing coverage"))
    if action == "inventory":
        spatial = model.by_type("IfcSpatialStructureElement")
        hierarchy = []
        for entity in spatial[:1000]:
            parents = [reference(r.RelatingObject) for r in entity.Decomposes if r.is_a("IfcRelAggregates")]
            hierarchy.append({**reference(entity), "parents": parents})
        result.update({"elementCount": len(values), "types": dict(Counter(v.is_a() for v in values)), "spatialHierarchy": hierarchy,
                       "spatialCoverage": {"total": len(spatial), "returned": min(len(spatial), 1000)},
                       "openingCount": len(model.by_type("IfcOpeningElement")), "project": [reference(p) for p in model.by_type("IfcProject")]})
    else:
        maximum = 100 if action == "query" else 20
        offset = bounded_int(request.get("offset"), 0, 0, 10000000, "offset")
        limit = bounded_int(request.get("limit"), maximum if action == "query" else 10, 1, maximum, "limit")
        page = values[offset:offset + limit]
        missing = sorted(set(request.get("globalIds") or []) - {v.GlobalId for v in values})
        for identifier in missing:
            result["issues"].append(issue("element-missing", "Requested GlobalId absent from selected physical elements", identifier, "error"))
        result["page"] = {"offset": offset, "limit": limit, "totalMatched": len(values), "returned": len(page), "nextOffset": offset + len(page) if offset + len(page) < len(values) else None}
        if action == "query":
            result["elements"] = [query_row(v, units["lengthToMeters"], source_hash) for v in page]
            result["issues"].append(issue("native-qto-not-recalculated", "Native IFC quantities are author-provided values, not recomputed or certified contract quantities. Properties are bounded to 100 entries per container and 2000 characters per string."))
        else:
            rows, issues, triangles = geometry_rows(page, request, source, units)
            result.update({"elements": rows, "trianglesProcessed": triangles,
                           "coverage": {"selected": len(page), "measured": sum(v["status"] == "measured" for v in rows), "failed": sum(v["status"] == "failed" for v in rows), "unprocessedMatched": len(values) - len(page), "missingGlobalIds": missing}})
            result["issues"].extend(issues)
            result["issues"].append(issue("geometry-quantity-basis", "Triangulated geometry in SI units; excludes unselected, failed and nonphysical elements. It is not native QTO, contract measurement, fabrication quantity or evidence of complete drawing coverage."))
    if sha(path) != source_hash:
        raise ValueError("IFC file changed during processing; result discarded")
    return result


if __name__ == "__main__":
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        raw = sys.stdin.read(1024 * 1024 + 1)
        if len(raw.encode("utf-8")) > 1024 * 1024:
            raise ValueError("Worker request exceeds 1 MiB")
        response = {"ok": True, "result": main(json.loads(raw))}
    except Exception as error:
        response = {"ok": False, "error": str(error)}
    print(json.dumps(response, ensure_ascii=False, allow_nan=False))
