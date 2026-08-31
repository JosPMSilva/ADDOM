from dataclasses import dataclass


@dataclass(frozen=True)
class Person:
    name: str
    score: int


def top_people(rows: list[Person]) -> list[str]:
    ordered = sorted(rows, key=lambda row: row.score, reverse=True)
    return [row.name for row in ordered[:3]]


if __name__ == "__main__":
    print(top_people([Person("Ada", 9), Person("Linus", 7)]))
