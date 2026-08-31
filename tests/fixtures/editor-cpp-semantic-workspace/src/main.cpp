#include <string>

std::string greet(const std::string& name) {
  return "Hello, " + name;
}

int main() {
  return static_cast<int>(greet("ADDOM").size());
}
