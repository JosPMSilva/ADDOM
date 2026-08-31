package main

import "fmt"

type Item struct {
	Name  string
	Value int
}

func total(items []Item) int {
	sum := 0
	for _, item := range items {
		sum += item.Value
	}
	return sum
}

func main() {
	fmt.Println(total([]Item{{Name: "alpha", Value: 3}, {Name: "beta", Value: 4}}))
}
