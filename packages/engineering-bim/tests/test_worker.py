import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import worker
import ifcopenshell
import ifcopenshell.api.feature
import ifcopenshell.api.root
from ifcopenshell.util.unit import convert_file_length_units


class IfcWorkerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="engineering-ifc-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.path = self.root / "model.ifc"
        worker.main({"cwd": str(self.root), "request": {"action": "generate", "outputPath": str(self.path), "projectName": "Civil fixture",
                    "components": [{"id": "slab", "name": "Concrete slab", "type": "IfcSlab", "sizeMeters": [10, 2, 0.3], "positionMeters": [100, 200, 3]}]}})

    def read(self, action="geometry", **values):
        return worker.main({"cwd": str(self.root), "request": {"action": action, "sourcePath": str(self.path), "expectedSha256": worker.sha(self.path), **values}})

    def test_native_qto_is_not_replaced_by_geometric_volume(self):
        model = ifcopenshell.open(self.path)
        element = model.by_type("IfcSlab")[0]
        quantity = model.create_entity("IfcQuantityVolume", Name="NetVolume", VolumeValue=99.)
        qset = model.create_entity("IfcElementQuantity", GlobalId=ifcopenshell.guid.new(), Name="Qto_SlabBaseQuantities", MethodOfMeasurement="Author provided", Quantities=[quantity])
        model.create_entity("IfcRelDefinesByProperties", GlobalId=ifcopenshell.guid.new(), RelatedObjects=[element], RelatingPropertyDefinition=qset)
        model.write(self.path)
        native = self.read("query")["elements"][0]["nativeQuantities"][0]
        self.assertEqual(native["value"], 99.)
        self.assertEqual(native["origin"], "native_ifc_qto")
        geometry = self.read()["elements"][0]
        self.assertAlmostEqual(geometry["netVolumeM3"], 6.)
        self.assertEqual(geometry["origin"], "triangulated_geometry")

    def test_millimetre_model_preserves_si_quantities_and_placement(self):
        model = convert_file_length_units(ifcopenshell.open(self.path), "MILLIMETER")
        model.write(self.path)
        result = self.read()
        self.assertEqual(result["units"]["lengthToMeters"], 0.001)
        self.assertAlmostEqual(result["elements"][0]["netVolumeM3"], 6.)
        self.assertEqual(self.read("query")["elements"][0]["positionMeters"], [100., 200., 3.])

    def test_opening_net_and_gross_are_measured_separately(self):
        model = ifcopenshell.open(self.path)
        slab = model.by_type("IfcSlab")[0]
        body = slab.Representation.Representations[0].ContextOfItems
        opening = worker.prism(model, body, {"id": "opening", "type": "IfcBuildingElementProxy", "name": "Opening", "sizeMeters": [1., 1., 1.], "positionMeters": [101., 200.5, 2.8]}, "IfcOpeningElement")
        ifcopenshell.api.feature.add_feature(model, feature=opening, element=slab)
        model.write(self.path)
        row = self.read()["elements"][0]
        self.assertEqual(row["openingCount"], 1)
        self.assertEqual(row["status"], "measured")
        self.assertAlmostEqual(row["netVolumeM3"], 5.7)
        self.assertAlmostEqual(row["grossVolumeM3"], 6.)
        self.assertAlmostEqual(row["openingVolumeM3"], 0.3)

    def test_missing_geometry_and_unrelated_opening_never_become_zero_volume(self):
        model = ifcopenshell.open(self.path)
        slab = model.by_type("IfcSlab")[0]
        body = slab.Representation.Representations[0].ContextOfItems
        opening = worker.prism(model, body, {"id": "opening", "type": "IfcBuildingElementProxy", "name": "Wrong opening", "sizeMeters": [1., 1., 1.], "positionMeters": [0., 0., 0.]}, "IfcOpeningElement")
        ifcopenshell.api.feature.add_feature(model, feature=opening, element=slab)
        missing = ifcopenshell.api.root.create_entity(model, ifc_class="IfcBeam", name="Missing representation")
        model.write(self.path)
        result = self.read()
        self.assertEqual(result["elements"][0]["status"], "needs_review")
        self.assertIsNone(result["elements"][0]["openingVolumeM3"])
        missing_row = next(row for row in result["elements"] if row["globalId"] == missing.GlobalId)
        self.assertEqual(missing_row["status"], "failed")
        self.assertIsNone(missing_row["netVolumeM3"])
        self.assertEqual(result["coverage"]["failed"], 1)

    def test_missing_units_blocks_geometry_instead_of_assuming_metres(self):
        model = ifcopenshell.open(self.path)
        model.by_type("IfcUnitAssignment")[0].Units = []
        model.write(self.path)
        result = self.read()
        self.assertIsNone(result["elements"][0]["netVolumeM3"])
        self.assertEqual(result["elements"][0]["status"], "failed")
        self.assertTrue(any(value["code"] == "units-unknown" for value in result["issues"]))

    def test_multiple_openings_retain_individual_review_gap(self):
        model = ifcopenshell.open(self.path)
        slab = model.by_type("IfcSlab")[0]
        body = slab.Representation.Representations[0].ContextOfItems
        for number, position in enumerate(([101., 200.5, 2.8], [0., 0., 0.])):
            opening = worker.prism(model, body, {"id": f"opening-{number}", "type": "IfcBuildingElementProxy", "name": "Opening", "sizeMeters": [1., 1., 1.], "positionMeters": position}, "IfcOpeningElement")
            ifcopenshell.api.feature.add_feature(model, feature=opening, element=slab)
        model.write(self.path)
        row = self.read()["elements"][0]
        self.assertEqual(row["openingCount"], 2)
        self.assertAlmostEqual(row["netVolumeM3"], 5.7)
        self.assertEqual(row["status"], "needs_review")
        self.assertEqual(row["openingVerification"], "aggregate_subtraction_only")


if __name__ == "__main__":
    unittest.main()
