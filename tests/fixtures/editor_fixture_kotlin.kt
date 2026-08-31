data class Item(val name: String, val value: Int)

fun main() {
    val items = listOf(Item("alpha", 1), Item("beta", 2))
    val total = items.sumOf { it.value }
    println(total)
}
