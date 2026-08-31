#[derive(Debug)]
struct Metric {
    name: &'static str,
    value: i32,
}

fn total(metrics: &[Metric]) -> i32 {
    metrics.iter().map(|metric| metric.value).sum()
}

fn main() {
    let metrics = [Metric { name: "open", value: 2 }, Metric { name: "save", value: 5 }];
    println!("{} {}", metrics[0].name, total(&metrics));
}
