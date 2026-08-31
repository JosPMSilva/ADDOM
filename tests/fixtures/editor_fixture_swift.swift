import Foundation

struct Row {
    let name: String
    let value: Int
}

let rows = [Row(name: "alpha", value: 1), Row(name: "beta", value: 2)]
let total = rows.reduce(0) { partial, row in partial + row.value }
print(total)
