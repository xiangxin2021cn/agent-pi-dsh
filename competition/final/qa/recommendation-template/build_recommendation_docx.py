from __future__ import annotations

import argparse
import hashlib
import zipfile
from pathlib import Path

from lxml import etree


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
XML_NS = "http://www.w3.org/XML/1998/namespace"
NS = {"w": W_NS}
W = f"{{{W_NS}}}"

EXPECTED_SOURCE_SHA256 = (
    "1C0A447777E52FBA935F87FEE86BA873DF4E356E1217A49CA92F8D443F99E0AD"
)

WORK_NAME = "海外工程投标及商业调研全流程AI智能 Agent 作业系统"
CONTESTANT = "向鑫"
TRACK = "海外业务赛道"
UNIT = "博茨公司"
SUMMARY = (
    "本作品面向海外工程商业调研与投标作业两类长程任务，构建商业调研轨与工程投标轨并行的"
    "AI Agent 作业系统。系统围绕国别市场、业主伙伴、招标文件、技术条款、BOQ 与施工策划"
    "组织专业流程，并以证据门禁核验来源、日期、适用口径及冲突情况。关键结论通过可点击引用"
    "回溯至源文件、页码和条款，证据不足则暂缓放行。通过门禁的内容汇入统一成果树，形成决策"
    "报告、组价工作簿、施工策划和投标标稿等 Official Outputs。AI 负责生成可追溯、可复核的"
    "专业草稿，关键判断、最终工程量与价格仍由具备职责的专业人员审核确认。"
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def cell_text(cell: etree._Element) -> str:
    return "".join(cell.itertext()).strip()


def set_paragraph_text(
    cell: etree._Element,
    text: str,
    *,
    alignment: str,
    first_line: int | None = None,
    line_spacing: int | None = None,
) -> None:
    paragraphs = cell.findall("w:p", NS)
    if len(paragraphs) != 1:
        raise ValueError(f"Expected one paragraph in editable cell, found {len(paragraphs)}")
    paragraph = paragraphs[0]
    for child in list(paragraph):
        if child.tag in {W + "r", W + "hyperlink", W + "smartTag"}:
            paragraph.remove(child)

    ppr = paragraph.find("w:pPr", NS)
    if ppr is None:
        ppr = etree.Element(W + "pPr")
        paragraph.insert(0, ppr)

    jc = ppr.find("w:jc", NS)
    if jc is None:
        jc = etree.SubElement(ppr, W + "jc")
    jc.set(W + "val", alignment)

    spacing = ppr.find("w:spacing", NS)
    if spacing is None:
        spacing = etree.SubElement(ppr, W + "spacing")
    spacing.set(W + "before", "0")
    spacing.set(W + "after", "0")
    if line_spacing is not None:
        spacing.set(W + "line", str(line_spacing))
        spacing.set(W + "lineRule", "auto")

    if first_line is not None:
        indent = ppr.find("w:ind", NS)
        if indent is None:
            indent = etree.SubElement(ppr, W + "ind")
        indent.set(W + "firstLine", str(first_line))

    run = etree.Element(W + "r")
    rpr = etree.SubElement(run, W + "rPr")
    fonts = etree.SubElement(rpr, W + "rFonts")
    fonts.set(W + "hint", "eastAsia")
    fonts.set(W + "ascii", "仿宋_GB2312")
    fonts.set(W + "hAnsi", "宋体")
    fonts.set(W + "eastAsia", "仿宋_GB2312")
    etree.SubElement(rpr, W + "sz").set(W + "val", "21")
    etree.SubElement(rpr, W + "szCs").set(W + "val", "21")
    language = etree.SubElement(rpr, W + "lang")
    language.set(W + "val", "en-US")
    language.set(W + "eastAsia", "zh-CN")
    text_node = etree.SubElement(run, W + "t")
    if text != text.strip() or "  " in text:
        text_node.set(f"{{{XML_NS}}}space", "preserve")
    text_node.text = text

    insert_at = len(paragraph)
    for index, child in enumerate(paragraph):
        if child.tag in {W + "bookmarkStart", W + "bookmarkEnd"}:
            insert_at = index
            break
    paragraph.insert(insert_at, run)


def build(source: Path, output: Path) -> None:
    if sha256(source) != EXPECTED_SOURCE_SHA256:
        raise ValueError("Official source hash does not match the approved template baseline")

    with zipfile.ZipFile(source, "r") as source_zip:
        original_parts = {info.filename: source_zip.read(info.filename) for info in source_zip.infolist()}
        infos = source_zip.infolist()

    root = etree.fromstring(original_parts["word/document.xml"])
    tables = root.findall(".//w:tbl", NS)
    if len(tables) != 1:
        raise ValueError(f"Expected exactly one table, found {len(tables)}")
    rows = tables[0].findall("w:tr", NS)
    if len(rows) != 7:
        raise ValueError(f"Expected seven table rows, found {len(rows)}")

    expected_labels = [
        (0, 0, "参赛作品名称"),
        (1, 0, "参赛选手姓名"),
        (1, 2, "参赛作品赛道"),
        (2, 0, "所属单位"),
        (3, 0, "作品简介"),
    ]
    for row_index, cell_index, expected in expected_labels:
        cells = rows[row_index].findall("w:tc", NS)
        if cell_text(cells[cell_index]) != expected:
            raise ValueError(f"Unexpected label at row {row_index + 1}, cell {cell_index + 1}")

    approval_before = [etree.tostring(row) for row in rows[4:7]]

    row_cells = [row.findall("w:tc", NS) for row in rows]
    targets = [
        (row_cells[0][1], WORK_NAME, "center", None, None),
        (row_cells[1][1], CONTESTANT, "center", None, None),
        (row_cells[1][3], TRACK, "center", None, None),
        (row_cells[2][1], UNIT, "center", None, None),
        (row_cells[3][1], SUMMARY, "both", 420, 300),
    ]
    for cell, text, alignment, first_line, line_spacing in targets:
        if cell_text(cell):
            raise ValueError("Approved editable slot was not blank in the official source")
        set_paragraph_text(
            cell,
            text,
            alignment=alignment,
            first_line=first_line,
            line_spacing=line_spacing,
        )

    if approval_before != [etree.tostring(row) for row in rows[4:7]]:
        raise ValueError("Approval rows changed during authoring")

    updated_document = etree.tostring(
        root,
        xml_declaration=True,
        encoding="UTF-8",
        standalone="yes",
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w") as output_zip:
        for info in infos:
            data = updated_document if info.filename == "word/document.xml" else original_parts[info.filename]
            output_zip.writestr(info, data)

    with zipfile.ZipFile(output, "r") as final_zip:
        final_parts = {info.filename: final_zip.read(info.filename) for info in final_zip.infolist()}
    if set(final_parts) != set(original_parts):
        raise ValueError("Package part inventory changed")
    changed = [name for name in original_parts if original_parts[name] != final_parts[name]]
    if changed != ["word/document.xml"]:
        raise ValueError(f"Unexpected changed package parts: {changed}")

    final_root = etree.fromstring(final_parts["word/document.xml"])
    final_rows = final_root.find(".//w:tbl", NS).findall("w:tr", NS)
    final_cells = [row.findall("w:tc", NS) for row in final_rows]
    actual = [
        cell_text(final_cells[0][1]),
        cell_text(final_cells[1][1]),
        cell_text(final_cells[1][3]),
        cell_text(final_cells[2][1]),
        cell_text(final_cells[3][1]),
    ]
    expected = [WORK_NAME, CONTESTANT, TRACK, UNIT, SUMMARY]
    if actual != expected:
        raise ValueError("Final field text does not match the five approved values")
    if [etree.tostring(row) for row in final_rows[4:7]] != approval_before:
        raise ValueError("Final approval rows differ from the official source")

    print(f"output={output}")
    print(f"output_sha256={sha256(output)}")
    print(f"summary_characters={len(SUMMARY)}")
    print("changed_package_parts=word/document.xml")
    print("approval_rows_unchanged=true")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.source.resolve(), args.output.resolve())


if __name__ == "__main__":
    main()
