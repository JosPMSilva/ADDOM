#include <iostream>
#include <string>
#include <vector>

int main() {
  std::vector<std::string> names = {"alpha", "beta", "gamma"};
  for (const auto& name : names) {
    std::cout << name << std::endl;
  }
  return 0;
}
