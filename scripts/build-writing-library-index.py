import json
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET


NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
}


def text_from_paragraph(paragraph):
    chunks = []
    for node in paragraph.iter():
        if node.tag == f"{{{NS['w']}}}t" and node.text:
            chunks.append(node.text)
        elif node.tag == f"{{{NS['w']}}}tab":
            chunks.append("\t")
        elif node.tag == f"{{{NS['w']}}}br":
            chunks.append("\n")
    return "".join(chunks).strip()


def paragraph_style(paragraph):
    style_node = paragraph.find("./w:pPr/w:pStyle", NS)
    if style_node is None:
        return ""
    return style_node.attrib.get(f"{{{NS['w']}}}val", "")


def read_docx(path):
    with zipfile.ZipFile(path) as archive:
        xml = archive.read("word/document.xml")

    root = ET.fromstring(xml)
    body = root.find("w:body", NS)
    paragraphs = []
    headings = []

    if body is None:
        return {"paragraphs": paragraphs, "headings": headings}

    for paragraph in body.iter(f"{{{NS['w']}}}p"):
        text = text_from_paragraph(paragraph)
        if not text:
            continue

        style = paragraph_style(paragraph)
        is_heading = bool(re.search(r"heading|title|标题", style, re.I))
        if is_heading or re.match(r"^第[一二三四五六七八九十百零〇\d]+[章节卷部篇]", text):
            headings.append(text)

        paragraphs.append(
            {
                "text": text,
                "style": style,
                "is_heading": is_heading,
            }
        )

    return {"paragraphs": paragraphs, "headings": headings}


def infer_category(filename):
    rules = [
        ("agent_instructions", ["Agent总指令", "写作Agent"]),
        ("dialogue_voice", ["对白", "人物声音"]),
        ("opening_pack", ["开篇写作准备包"]),
        ("outline", ["大纲", "章纲"]),
        ("characters", ["人物"]),
        ("worldbuilding", ["世界观"]),
        ("map_routes", ["地图", "路线"]),
        ("region", ["地域设定"]),
        ("chapter_pacing", ["章节结构", "连载节奏"]),
        ("location_generation", ["小地点"]),
        ("travel_life", ["旅行制度", "路上生活"]),
        ("daily_life", ["日常职业", "市井生活"]),
        ("food_taverns", ["饮食", "酒馆"]),
        ("magic_folklore", ["魔法", "民俗"]),
        ("local_detail", ["详细设定", "补充"]),
    ]
    for category, needles in rules:
        if any(needle in filename for needle in needles):
            return category
    return "reference"


def chunk_document(paragraphs, max_chars=1400):
    chunks = []
    current_title = "正文"
    current_text = []
    current_chars = 0

    def flush():
        nonlocal current_text, current_chars
        text = "\n".join(current_text).strip()
        if text:
            chunks.append(
                {
                    "title": current_title,
                    "text": text,
                    "charCount": len(text),
                }
            )
        current_text = []
        current_chars = 0

    for paragraph in paragraphs:
        text = paragraph["text"]
        looks_like_heading = paragraph["is_heading"] or (
            len(text) <= 42
            and (
                re.match(r"^[一二三四五六七八九十\d]+[、.．]", text)
                or re.match(r"^第[一二三四五六七八九十百零〇\d]+[章节卷部篇]", text)
                or text.endswith(("：", ":"))
            )
        )

        if looks_like_heading:
            flush()
            current_title = text.rstrip("：:")
            continue

        if current_chars + len(text) > max_chars and current_text:
            flush()
        current_text.append(text)
        current_chars += len(text)

    flush()
    return chunks


def make_doc_id(index, filename):
    slug = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "-", filename).strip("-").lower()
    return f"doc-{index:02d}-{slug}"


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build-writing-library-index.py <library_dir> <output_json>")

    library_dir = Path(sys.argv[1])
    output_json = Path(sys.argv[2])
    docs = []
    chunks = []

    for index, path in enumerate(sorted(library_dir.glob("*.docx")), start=1):
        content = read_docx(path)
        filename = path.stem
        doc_id = make_doc_id(index, filename)
        category = infer_category(filename)
        plain_text = "\n".join(p["text"] for p in content["paragraphs"])
        doc_chunks = chunk_document(content["paragraphs"])

        docs.append(
            {
                "id": doc_id,
                "title": filename,
                "fileName": path.name,
                "category": category,
                "charCount": len(plain_text),
                "paragraphCount": len(content["paragraphs"]),
                "chunkCount": len(doc_chunks),
                "headings": content["headings"][:120],
                "preview": plain_text[:500],
            }
        )

        for chunk_index, chunk in enumerate(doc_chunks, start=1):
            chunks.append(
                {
                    "id": f"{doc_id}__chunk_{chunk_index:03d}",
                    "documentId": doc_id,
                    "documentTitle": filename,
                    "category": category,
                    "title": chunk["title"],
                    "text": chunk["text"],
                    "charCount": chunk["charCount"],
                }
            )

    payload = {
        "libraryName": "斗篷下的漫长闲逛 写作资料库",
        "sourceDirectoryName": library_dir.name,
        "builtAt": datetime.now(timezone.utc).isoformat(),
        "documentCount": len(docs),
        "chunkCount": len(chunks),
        "categories": sorted({doc["category"] for doc in docs}),
        "documents": docs,
        "chunks": chunks,
    }

    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"documents": len(docs), "chunks": len(chunks), "output": str(output_json)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
