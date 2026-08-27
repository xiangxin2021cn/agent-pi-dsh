using System;
using System.Diagnostics;
using System.IO;
using System.Linq;

internal static class Program
{
    static string Quote(string value)
    {
        if (value.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return value;
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    static int Main(string[] args)
    {
        var exe = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "7za-orig.exe");
        var list = args.ToList();
        if (list.Count > 0 && list[0] == "a")
        {
            if (!list.Contains("-snl")) list.Insert(1, "-snl");
            if (!list.Contains("-snh")) list.Insert(1, "-snh");
        }
        var psi = new ProcessStartInfo
        {
            FileName = exe,
            Arguments = string.Join(" ", list.Select(Quote)),
            UseShellExecute = false,
        };
        var process = Process.Start(psi);
        if (process == null) return 1;
        process.WaitForExit();
        return process.ExitCode;
    }
}
