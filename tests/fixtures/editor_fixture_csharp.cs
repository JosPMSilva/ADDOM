using System;
using System.Linq;

public static class EditorFixtureCSharp
{
    public static int Sum(params int[] values) => values.Sum();

    public static void Main()
    {
        Console.WriteLine(Sum(2, 3, 5));
    }
}
