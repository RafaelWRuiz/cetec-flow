"""Leitura somente da fonte; extrai turmas e vínculos sem imprimir a planilha.

Uso: python analisar.py <arquivo.xlsx>
Salva um JSON compacto no diretório deste script. Requer openpyxl para leitura.
Não é um parser de produção nem implementa decisões de abertura.
"""
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

sys.stdout.reconfigure(encoding="utf-8")
source = Path(sys.argv[1])
output = Path(__file__).resolve().parent
wb = openpyxl.load_workbook(source, read_only=False, data_only=False)
sheet = wb["Plan1"]
offers, incoming, outgoing, issues, formulas = [], [], [], [], []
current = None
header = None
for row in sheet.iter_rows():
    values = [cell.value for cell in row]
    for cell in row:
        if cell.data_type == "f":
            formulas.append({"cell": cell.coordinate, "formula": cell.value})
    if values[0] == "Aprovado":
        header = row[0].row
        continue
    if not header:
        continue
    if values[1] is not None:
        seat_raw = values[5]
        seat_label = None
        if isinstance(seat_raw, str):
            match = re.fullmatch(r"\s*(\d+)\s*(.*?)\s*", seat_raw)
            if match:
                seat_raw = int(match.group(1))
                seat_label = match.group(2) or None
        current = {
            "id": f"Plan1:{row[0].row}", "row": row[0].row,
            "approval": values[0], "city": values[1], "unit": values[2],
            "course": values[3], "period": values[4], "seats": seat_raw,
            "seat_label": seat_label,
            "first": values[6], "demand_reported": values[7],
            "label": f"{values[2]} - {values[3]} ({values[4]})",
            "approval_style": row[0].style_id,
            "unit_style": row[2].style_id,
        }
        offers.append(current)
    for label_index, count_index, direction, collection in [
        (8, 9, "incoming", incoming), (10, 11, "outgoing", outgoing)
    ]:
        label, count = values[label_index], values[count_index]
        if label is None and count is None:
            continue
        if current is None or not isinstance(label, str) or not isinstance(count, (int, float)) or count < 0 or int(count) != count:
            issues.append({"row": row[0].row, "direction": direction, "label": label, "count": count})
            continue
        collection.append({"owner_id": current["id"], "owner_label": current["label"],
                           "other_label": label, "count": count, "row": row[0].row})

lookup = defaultdict(list)
for offer in offers:
    lookup[offer["label"]].append(offer)

def pairs(records, is_incoming):
    grouped = defaultdict(list)
    for record in records:
        key = ((record["other_label"], record["owner_label"]) if is_incoming
               else (record["owner_label"], record["other_label"]))
        grouped[key].append(record)
    return grouped

inc = pairs(incoming, True)
out = pairs(outgoing, False)
internal_keys = {key for key in set(inc) | set(out) if key[0] in lookup and key[1] in lookup}
matched, mismatches, missing_incoming, missing_outgoing = [], [], [], []
for key in sorted(internal_keys):
    if key not in inc:
        missing_incoming.append(key)
    elif key not in out:
        missing_outgoing.append(key)
    elif sum(r["count"] for r in inc[key]) != sum(r["count"] for r in out[key]):
        mismatches.append({"source": key[0], "target": key[1],
                           "incoming": inc[key], "outgoing": out[key]})
    else:
        matched.append(key)

for offer in offers:
    offer["incoming_total"] = sum(r["count"] for r in incoming if r["owner_id"] == offer["id"])
    offer["outgoing_total"] = sum(r["count"] for r in outgoing if r["owner_id"] == offer["id"])
    i, v = offer["first"], offer["seats"]
    valid = isinstance(i, (int, float)) and isinstance(v, (int, float)) and i >= 0 and v > 0
    offer["demand_calculated"] = i / v if valid else None
    if not valid:
        issues.append({"id": offer["id"], "reason": "invalid first/seats"})

unknown_in = [r for r in incoming if r["other_label"] not in lookup]
unknown_out = [r for r in outgoing if r["other_label"] not in lookup]
over = [o for o in offers if isinstance(o["first"], (int,float)) and o["outgoing_total"] > o["first"]]
under = [o for o in offers if isinstance(o["first"], (int,float)) and o["outgoing_total"] < o["first"]]
ratio_disagreements = [o for o in offers if o["demand_calculated"] is not None and isinstance(o["demand_reported"], (int,float)) and abs(o["demand_calculated"] - o["demand_reported"]) > 0.00500001]
summary = {
    "source_name": source.name, "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "sheets": [{"name": s.title, "rows": s.max_row, "columns": s.max_column} for s in wb],
    "header_row": header,
    "headers": [sheet.cell(header, col).value for col in range(1, sheet.max_column + 1)],
    "historical_offer_rows": len(offers),
    "historical_incoming_relation_rows": len(incoming),
    "historical_outgoing_relation_rows": len(outgoing),
    "approval_cells_populated_in_sample": sum(o["approval"] is not None for o in offers),
    "mixed_seat_and_label_rows_in_sample": sum(o["seat_label"] is not None for o in offers),
    "internal_pairs_reconciling_in_both_views_in_sample": len(matched),
    "internal_pair_disagreements_in_sample": len(mismatches),
    "pair_rows_missing_from_incoming_view_in_sample": len(missing_incoming),
    "pair_rows_missing_from_outgoing_view_in_sample": len(missing_outgoing),
    "external_incoming_rows_in_sample": len(unknown_in),
    "external_outgoing_rows_in_sample": len(unknown_out),
    "formulas_in_sample": len(formulas),
    "invalid_rows_in_sample": len(issues),
    "merged_ranges_in_sample": len(sheet.merged_cells.ranges),
}
diagnostics = {"scope": "sample of prior semester; do not assume counts or status match the new edition",
               "summary": summary}
(output / "diagnostico.json").write_text(json.dumps(diagnostics, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False, indent=2))
