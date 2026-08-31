using System;

internal static class Program
{
    private static string Greet(string name)
    {
        return $"Hello, {name}";
    }

    private static void Main()
    {
        Console.WriteLine(Greet("ADDOM"));
    }
}
