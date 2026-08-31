#include <stdio.h>

int sum(const int *values, int length) {
  int total = 0;
  for (int i = 0; i < length; i += 1) {
    total += values[i];
  }
  return total;
}

int main(void) {
  int values[] = {1, 2, 3, 4};
  printf("%d\n", sum(values, 4));
  return 0;
}
