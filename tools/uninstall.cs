// Uninstall.exe: removes BlockHost from the folder it sits in. Asks before touching the data folder
// (servers, worlds, backups) and keeps it by default. Refuses to run anywhere that does not look like a
// BlockHost install. Test switches: --yes (no questions, keep data), --delete-data (with --yes).
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Microsoft.Win32;

static class Uninstall
{
    const string UninstallKey = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\BlockHost";

    [STAThread]
    static int Main(string[] args)
    {
        bool yes = Array.IndexOf(args, "--yes") >= 0, wipeArg = Array.IndexOf(args, "--delete-data") >= 0;
        string dir = Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory).TrimEnd('\\');
        Func<string, int> fail = delegate (string msg) { if (!yes) MessageBox.Show(msg, "Uninstall BlockHost", MessageBoxButtons.OK, MessageBoxIcon.Warning); else Console.Error.WriteLine(msg); return 1; };

        // Safety: only ever remove a folder that is clearly a BlockHost install, never a drive or a system/user folder.
        if (!File.Exists(Path.Combine(dir, "BlockHost.exe")) || !File.Exists(Path.Combine(dir, "app\\server.js"))) return fail("This doesn't look like a BlockHost folder, so nothing was removed.");
        string[] forbidden = {
            Path.GetPathRoot(dir), Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), Environment.GetFolderPath(Environment.SpecialFolder.Windows)
        };
        foreach (string x in forbidden) if (!string.IsNullOrEmpty(x) && string.Equals(x.TrimEnd('\\'), dir, StringComparison.OrdinalIgnoreCase)) return fail("BlockHost is installed in a folder that can't be removed automatically. Delete its files by hand.");
        if (Running(dir)) return fail("BlockHost is running. Click \"Quit BlockHost\" inside it first, then try again.");
        // An open BlockHost window keeps its files locked: ask it to close, and stop if it won't.
        foreach (Process p in Process.GetProcessesByName("BlockHost"))
        {
            string exe = null; try { exe = p.MainModule.FileName; } catch { }
            if (exe == null || !exe.StartsWith(dir + "\\", StringComparison.OrdinalIgnoreCase)) continue;
            try { p.CloseMainWindow(); if (!p.WaitForExit(8000)) return fail("Close the BlockHost window first, then try again."); }
            catch { return fail("Close the BlockHost window first, then try again."); }
        }

        bool wipe = wipeArg;
        if (!yes)
        {
            if (MessageBox.Show("Remove BlockHost from this PC?", "Uninstall BlockHost", MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK) return 0;
            wipe = MessageBox.Show("Also delete your servers, worlds and backups?\n\nChoose No to keep them in:\n" + Path.Combine(dir, "data"), "Uninstall BlockHost", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) == DialogResult.Yes;
        }

        // Shortcuts (only ones that point into this folder) and the Apps & features entry.
        foreach (string place in new[] { Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), Environment.GetFolderPath(Environment.SpecialFolder.Programs) })
        {
            string lnk = Path.Combine(place, "BlockHost.lnk");
            try { if (File.Exists(lnk) && ShortcutTarget(lnk).StartsWith(dir + "\\", StringComparison.OrdinalIgnoreCase)) File.Delete(lnk); } catch { }
        }
        try
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(UninstallKey))
                if (k != null && string.Equals(((k.GetValue("InstallLocation") as string) ?? "").TrimEnd('\\'), dir, StringComparison.OrdinalIgnoreCase)) { k.Close(); Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false); }
        }
        catch { }

        // Program files. The data folder only if asked. This exe removes itself after it exits.
        string self = Path.GetFullPath(Assembly.GetExecutingAssembly().Location);
        string problems = "";
        foreach (string d in Directory.GetDirectories(dir))
        {
            if (!wipe && string.Equals(Path.GetFileName(d), "data", StringComparison.OrdinalIgnoreCase)) continue;
            try { Directory.Delete(d, true); } catch (Exception e) { problems += "\n" + Path.GetFileName(d) + ": " + e.Message; }
        }
        foreach (string f in Directory.GetFiles(dir))
            if (!string.Equals(Path.GetFullPath(f), self, StringComparison.OrdinalIgnoreCase)) { try { File.Delete(f); } catch (Exception e) { problems += "\n" + Path.GetFileName(f) + ": " + e.Message; } }
        Process.Start(new ProcessStartInfo("cmd.exe", "/c ping 127.0.0.1 -n 3 >nul & del /f /q \"" + self + "\" & rmdir \"" + dir + "\"") { UseShellExecute = false, CreateNoWindow = true });

        string done = "BlockHost was removed." + (wipe ? "" : "\n\nYour servers, worlds and backups were kept in:\n" + Path.Combine(dir, "data")) + (problems.Length > 0 ? "\n\nSome files could not be removed:" + problems : "");
        if (!yes) MessageBox.Show(done, "Uninstall BlockHost", MessageBoxButtons.OK, MessageBoxIcon.Information); else Console.WriteLine(done);
        return 0;
    }

    static string ShortcutTarget(string lnk)
    {
        Type sh = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(sh);
        object l = sh.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
        return Path.GetFullPath((string)l.GetType().InvokeMember("TargetPath", BindingFlags.GetProperty, null, l, null));
    }

    static bool Running(string dir)
    {
        try
        {
            string f = Path.Combine(dir, "data\\instance.json");
            if (!File.Exists(f)) return false;
            Match m = Regex.Match(File.ReadAllText(f), "\"port\"\\s*:\\s*(\\d+)");
            if (!m.Success) return false;
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + m.Groups[1].Value + "/api/ping");
            req.Timeout = 1500;
            using (StreamReader r = new StreamReader(req.GetResponse().GetResponseStream())) { string t = r.ReadToEnd(); return t.Contains("\"blockhost\"") || t.Contains("\"mcsm\""); }
        }
        catch { return false; }
    }
}
