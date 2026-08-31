package com.addom;

public final class App {
    private App() {}

    static String greet(String name) {
        return "Hello, " + name;
    }

    public static void main(String[] args) {
        System.out.println(greet("ADDOM"));
    }
}
