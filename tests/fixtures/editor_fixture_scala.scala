object EditorFixtureScala {
  final case class Item(name: String, value: Int)

  def main(args: Array[String]): Unit = {
    val rows = List(Item("alpha", 1), Item("beta", 2))
    println(rows.map(_.value).sum)
  }
}
