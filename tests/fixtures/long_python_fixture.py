"""
Long Python fixture for editor and language-service performance testing.

The module is intentionally verbose but valid. It provides:
- repeated dataclass-like record building
- nested loops
- string-heavy helpers
- many small functions for symbols/outline/hover testing
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Sequence


PROJECT_NAME = "ADDOM Editor Fixture"
PROJECT_VERSION = "1.0.0"
DEFAULT_LIMIT = 250


@dataclass(frozen=True)
class MetricSample:
    name: str
    value: float
    unit: str
    tags: Dict[str, str]


@dataclass(frozen=True)
class FixtureRecord:
    record_id: int
    title: str
    category: str
    owner: str
    payload: Dict[str, object]


def clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))

def build_tag_map(prefix: str, count: int) -> Dict[str, str]:
    return {f"{prefix}_{index:02d}": f"value_{index:02d}" for index in range(count)}


def build_metric_samples(count: int) -> List[MetricSample]:
    samples: List[MetricSample] = []
    for index in range(count):
        samples.append(
            MetricSample(
                name=f"metric_{index:03d}",
                value=round((index * 1.75) % 97.0, 3),
                unit="ms",
                tags={
                    "bucket": f"b{index % 5}",
                    "group": f"g{index % 7}",
                },
            )
        )
    return samples


def build_record(index: int) -> FixtureRecord:
    return FixtureRecord(
        record_id=index,
        title=f"Fixture Record {index:03d}",
        category=f"category_{index % 9}",
        owner=f"owner_{index % 11}",
        payload={
            "enabled": index % 2 == 0,
            "priority": index % 5,
            "checksum": f"chk_{index:05d}",
            "path": f"src/module_{index % 13}/file_{index:03d}.py",
            "tags": build_tag_map("tag", 4),
        },
    )


def build_fixture_records(count: int) -> List[FixtureRecord]:
    return [build_record(index) for index in range(count)]


def summarize_metrics(samples: Sequence[MetricSample]) -> Dict[str, float]:
    if not samples:
        return {"count": 0.0, "min": 0.0, "max": 0.0, "avg": 0.0}
    values = [sample.value for sample in samples]
    return {
        "count": float(len(values)),
        "min": min(values),
        "max": max(values),
        "avg": round(sum(values) / len(values), 4),
    }


def summarize_records(records: Sequence[FixtureRecord]) -> Dict[str, int]:
    summary: Dict[str, int] = {}
    for record in records:
        summary[record.category] = summary.get(record.category, 0) + 1
    return dict(sorted(summary.items()))


def collect_owner_index(records: Sequence[FixtureRecord]) -> Dict[str, List[int]]:
    owners: Dict[str, List[int]] = {}
    for record in records:
        owners.setdefault(record.owner, []).append(record.record_id)
    return owners

def flatten_payload_paths(records: Sequence[FixtureRecord]) -> List[str]:
    paths: List[str] = []
    for record in records:
        path_value = str(record.payload.get("path", "")).strip()
        if path_value:
            paths.append(path_value)
    return paths


def build_text_block(seed: str, width: int, rows: int) -> str:
    normalized_seed = seed.strip() or "fixture"
    parts: List[str] = []
    for row in range(rows):
        prefix = f"{normalized_seed}:{row:03d}"
        payload = "|".join(f"{prefix}:{column:02d}" for column in range(width))
        parts.append(payload)
    return "\n".join(parts)


def scan_for_term(lines: Iterable[str], term: str) -> List[int]:
    result: List[int] = []
    normalized_term = term.strip().lower()
    if not normalized_term:
        return result
    for index, line in enumerate(lines, start=1):
        if normalized_term in line.lower():
            result.append(index)
    return result


def build_report(records: Sequence[FixtureRecord], samples: Sequence[MetricSample]) -> Dict[str, object]:
    return {
        "project": PROJECT_NAME,
        "version": PROJECT_VERSION,
        "record_count": len(records),
        "metric_count": len(samples),
        "record_summary": summarize_records(records),
        "metric_summary": summarize_metrics(samples),
    }


def render_report_lines(report: Dict[str, object]) -> List[str]:
    lines = [
        f"project={report.get('project', '')}",
        f"version={report.get('version', '')}",
        f"record_count={report.get('record_count', 0)}",
        f"metric_count={report.get('metric_count', 0)}",
    ]
    metric_summary = report.get("metric_summary", {})
    if isinstance(metric_summary, dict):
        for key in ("count", "min", "max", "avg"):
            lines.append(f"metric_{key}={metric_summary.get(key, 0)}")
    return lines


def compute_score(value: int, multiplier: int, offset: int) -> int:
    return clamp((value * multiplier) + offset, 0, 10_000)


def compute_score_01(value: int) -> int:
    return compute_score(value, 3, 1)


def compute_score_02(value: int) -> int:
    return compute_score(value, 5, 2)


def compute_score_03(value: int) -> int:
    return compute_score(value, 7, 3)


def compute_score_04(value: int) -> int:
    return compute_score(value, 11, 4)


def compute_score_05(value: int) -> int:
    return compute_score(value, 13, 5)


def compute_score_06(value: int) -> int:
    return compute_score(value, 17, 6)


def compute_score_07(value: int) -> int:
    return compute_score(value, 19, 7)


def compute_score_08(value: int) -> int:
    return compute_score(value, 23, 8)


def compute_score_09(value: int) -> int:
    return compute_score(value, 29, 9)


def compute_score_10(value: int) -> int:
    return compute_score(value, 31, 10)


def compute_score_11(value: int) -> int:
    return compute_score(value, 37, 11)


def compute_score_12(value: int) -> int:
    return compute_score(value, 41, 12)


def compute_score_13(value: int) -> int:
    return compute_score(value, 43, 13)


def compute_score_14(value: int) -> int:
    return compute_score(value, 47, 14)


def compute_score_15(value: int) -> int:
    return compute_score(value, 53, 15)


def compute_score_16(value: int) -> int:
    return compute_score(value, 59, 16)


def compute_score_17(value: int) -> int:
    return compute_score(value, 61, 17)


def compute_score_18(value: int) -> int:
    return compute_score(value, 67, 18)


def compute_score_19(value: int) -> int:
    return compute_score(value, 71, 19)


def compute_score_20(value: int) -> int:
    return compute_score(value, 73, 20)


def score_table(limit: int) -> List[Dict[str, int]]:
    rows: List[Dict[str, int]] = []
    bounded_limit = clamp(limit, 1, DEFAULT_LIMIT)
    for value in range(1, bounded_limit + 1):
        rows.append(
            {
                "value": value,
                "s01": compute_score_01(value),
                "s02": compute_score_02(value),
                "s03": compute_score_03(value),
                "s04": compute_score_04(value),
                "s05": compute_score_05(value),
                "s06": compute_score_06(value),
                "s07": compute_score_07(value),
                "s08": compute_score_08(value),
                "s09": compute_score_09(value),
                "s10": compute_score_10(value),
                "s11": compute_score_11(value),
                "s12": compute_score_12(value),
                "s13": compute_score_13(value),
                "s14": compute_score_14(value),
                "s15": compute_score_15(value),
                "s16": compute_score_16(value),
                "s17": compute_score_17(value),
                "s18": compute_score_18(value),
                "s19": compute_score_19(value),
                "s20": compute_score_20(value),
            }
        )
    return rows


def render_table(rows: Sequence[Dict[str, int]]) -> str:
    if not rows:
        return ""
    keys = list(rows[0].keys())
    header = ",".join(keys)
    body = []
    for row in rows:
        body.append(",".join(str(row.get(key, "")) for key in keys))
    return "\n".join([header, *body])


def build_fixture_bundle(record_count: int = 180, sample_count: int = 220) -> Dict[str, object]:
    records = build_fixture_records(record_count)
    samples = build_metric_samples(sample_count)
    report = build_report(records, samples)
    text_block = build_text_block("fixture-block", 8, 40)
    table = score_table(120)
    return {
        "records": records,
        "samples": samples,
        "report": report,
        "report_lines": render_report_lines(report),
        "owner_index": collect_owner_index(records),
        "paths": flatten_payload_paths(records),
        "text_block": text_block,
        "text_hits": scan_for_term(text_block.splitlines(), "fixture-block:010"),
        "table_csv": render_table(table),
    }


FIXTURE_BUNDLE = build_fixture_bundle()


if __name__ == "__main__":
    report_lines = FIXTURE_BUNDLE["report_lines"]
    for line in report_lines:
        print(line)
    print(f"text_hits={FIXTURE_BUNDLE['text_hits']}")
    print(f"paths={len(FIXTURE_BUNDLE['paths'])}")
