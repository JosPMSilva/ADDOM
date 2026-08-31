type Props = {
  title: string
}

export function FixturePanel({ title }: Props) {
  return (
    <section>
      <h2>{title}</h2>
    </section>
  )
}
