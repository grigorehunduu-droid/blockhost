// BlockHost: a native window (WebView2) around the local backend. No browser window, no address bar.
// Starts the Node backend hidden if needed. Falls back to an Edge/Chrome --app window if WebView2 is unavailable.
// Plain C# 5 so it compiles with the csc.exe that ships with Windows.
//   BlockHost.exe [--screen=N]   N = 1-based monitor number to open on (default: primary)
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;


static class Launcher
{
    internal static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;
    internal static string Boot = ""; // per-launch secret from data\instance.json; the page is only served with it
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);

    [STAThread]
    static int Main(string[] args)
    {
        bool created;
        Mutex mutex = new Mutex(true, "Local\\BlockHostApp", out created);
        if (!created) // already open, maybe hidden by the clock: ask it to show itself, then bring it to the front
        {
            try { EventWaitHandle.OpenExisting(MainForm.ShowSignalName).Set(); } catch { }
            FocusExisting(); return 0;
        }
        int screen = 0;
        foreach (string a in args) { Match m = Regex.Match(a, "^--screen=(\\d+)$"); if (m.Success) screen = int.Parse(m.Groups[1].Value); }
        Application.EnableVisualStyles();
        Application.Run(new MainForm(screen));
        GC.KeepAlive(mutex);
        return 0;
    }

    static void FocusExisting()
    {
        foreach (Process p in Process.GetProcessesByName("BlockHost"))
            if (p.Id != Process.GetCurrentProcess().Id && p.MainWindowHandle != IntPtr.Zero) { ShowWindow(p.MainWindowHandle, 9); SetForegroundWindow(p.MainWindowHandle); return; }
    }

    // ---- backend management ------------------------------------------------------------------
    internal static int Ping()
    {
        try
        {
            string f = Path.Combine(Root, "data\\instance.json");
            if (!File.Exists(f)) return 0;
            Match m = Regex.Match(File.ReadAllText(f), "\"port\"\\s*:\\s*(\\d+)");
            if (!m.Success) return 0;
            int port = int.Parse(m.Groups[1].Value);
            Match b = Regex.Match(File.ReadAllText(f), "\"boot\"\\s*:\\s*\"([0-9a-f]+)\"");
            Boot = b.Success ? b.Groups[1].Value : "";
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/api/ping");
            req.Timeout = 1500;
            using (StreamReader r = new StreamReader(req.GetResponse().GetResponseStream()))
                return r.ReadToEnd().Contains("\"blockhost\"") ? port : 0;
        }
        catch { return 0; }
    }

    static string FindNode()
    {
        string bundled = Path.Combine(Root, "runtime\\node\\node.exe");
        if (File.Exists(bundled)) return bundled;
        foreach (string dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
        {
            try
            {
                string exe = Path.Combine(dir.Trim('"'), "node.exe");
                if (!File.Exists(exe)) continue;
                ProcessStartInfo psi = new ProcessStartInfo(exe, "\"" + Path.Combine(Root, "app\\nodever.js") + "\"");
                psi.UseShellExecute = false; psi.CreateNoWindow = true;
                using (Process p = Process.Start(psi)) { p.WaitForExit(10000); if (p.HasExited && p.ExitCode == 0) return exe; }
            }
            catch { }
        }
        return null;
    }

    static string DownloadNode()
    {
        ProcessStartInfo psi = new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File \"" + Path.Combine(Root, "app\\get-node.ps1") + "\"");
        psi.UseShellExecute = false; psi.WorkingDirectory = Root; psi.CreateNoWindow = true;
        using (Process p = Process.Start(psi)) p.WaitForExit();
        string exe = Path.Combine(Root, "runtime\\node\\node.exe");
        return File.Exists(exe) ? exe : null;
    }

    internal static int EnsureBackend()
    {
        int port = Ping();
        if (port != 0) return port;
        string node = FindNode() ?? DownloadNode();
        if (node == null) return 0;
        ProcessStartInfo psi = new ProcessStartInfo(node, "app\\server.js");
        psi.WorkingDirectory = Root; psi.UseShellExecute = false; psi.CreateNoWindow = true;
        Process.Start(psi);
        for (int i = 0; i < 60 && port == 0; i++) { Thread.Sleep(500); port = Ping(); }
        return port;
    }

    internal static void OpenBrowserApp(string url)
    {
        string pf86 = Environment.GetEnvironmentVariable("ProgramFiles(x86)") ?? "", pf = Environment.GetEnvironmentVariable("ProgramFiles") ?? "", la = Environment.GetEnvironmentVariable("LocalAppData") ?? "";
        string[] browsers = {
            Path.Combine(pf86, "Microsoft\\Edge\\Application\\msedge.exe"), Path.Combine(pf, "Microsoft\\Edge\\Application\\msedge.exe"),
            Path.Combine(pf, "Google\\Chrome\\Application\\chrome.exe"), Path.Combine(pf86, "Google\\Chrome\\Application\\chrome.exe"), Path.Combine(la, "Google\\Chrome\\Application\\chrome.exe")
        };
        foreach (string b in browsers) if (File.Exists(b)) { Process.Start(b, "--app=" + url); return; }
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }
}

class MainForm : Form
{
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
    internal const string ShowSignalName = "Local\\BlockHostShow";
    readonly int screenIndex;
    WebView2 web;
    Label status;
    // Closing the window while a server runs hides BlockHost by the clock instead, so the server is not left without a window.
    readonly NotifyIcon tray = new NotifyIcon();
    bool reallyClose;

    static bool SystemIsDark()
    {
        try { object v = Microsoft.Win32.Registry.GetValue("HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", "AppsUseLightTheme", 1); return v is int && (int)v == 0; }
        catch { return false; }
    }

    public MainForm(int screen)
    {
        screenIndex = screen;
        bool dark = SystemIsDark();
        Text = "BlockHost";
        BackColor = dark ? Color.FromArgb(28, 28, 30) : Color.FromArgb(245, 245, 247);
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        Size = new Size(1360, 880); MinimumSize = new Size(960, 640);
        StartPosition = FormStartPosition.Manual;
        Screen target = (screen >= 1 && screen <= Screen.AllScreens.Length) ? Screen.AllScreens[screen - 1] : Screen.PrimaryScreen;
        Rectangle wa = target.WorkingArea;
        Size = new Size(Math.Min(Width, wa.Width - 40), Math.Min(Height, wa.Height - 40));
        Location = new Point(wa.X + (wa.Width - Width) / 2, wa.Y + (wa.Height - Height) / 2);
        status = new Label();
        status.Text = "Starting BlockHost…"; status.AutoSize = false; status.TextAlign = ContentAlignment.MiddleCenter; status.Dock = DockStyle.Fill;
        status.Font = new Font("Segoe UI", 14f); status.ForeColor = dark ? Color.Silver : Color.DimGray;
        Controls.Add(status);
        Shown += delegate { Boot(); };
        HandleCreated += delegate { int v = dark ? 1 : 0; DwmSetWindowAttribute(Handle, 20, ref v, 4); };

        tray.Icon = Icon ?? SystemIcons.Application; tray.Text = "BlockHost";
        tray.ContextMenu = new ContextMenu(new[] {
            new MenuItem("Open BlockHost", delegate { ShowFromTray(); }),
            new MenuItem("Quit BlockHost", delegate { ShowFromTray(); if (web != null && web.CoreWebView2 != null) web.CoreWebView2.ExecuteScriptAsync("actions.quit()"); })
        });
        tray.MouseClick += delegate (object s, MouseEventArgs e) { if (e.Button == MouseButtons.Left) ShowFromTray(); };
        tray.BalloonTipClicked += delegate { ShowFromTray(); };
        FormClosing += OnClosing;
        FormClosed += delegate { tray.Visible = false; tray.Dispose(); };
        // a second launch of BlockHost.exe signals this one to come back
        EventWaitHandle signal = new EventWaitHandle(false, EventResetMode.AutoReset, ShowSignalName);
        Thread waiter = new Thread(delegate () { while (signal.WaitOne()) { try { BeginInvoke((MethodInvoker)ShowFromTray); } catch { return; } } });
        waiter.IsBackground = true; waiter.Start();
    }

    void ShowFromTray()
    {
        Show(); if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        Activate(); tray.Visible = false;
    }

    async void OnClosing(object sender, FormClosingEventArgs e)
    {
        if (reallyClose || e.CloseReason != CloseReason.UserClosing || web == null || web.CoreWebView2 == null) return;
        e.Cancel = true; // decide after asking the page whether a server is running
        string busy = "false";
        try { busy = await web.CoreWebView2.ExecuteScriptAsync("typeof S !== 'undefined' && S.servers.some(function (s) { return ['running', 'starting', 'stopping', 'installing'].indexOf(s.status) >= 0; })"); } catch { }
        if (busy == "true")
        {
            Hide(); tray.Visible = true;
            tray.ShowBalloonTip(5000, "BlockHost is still running", "Your server keeps going. Click the BlockHost icon by the clock to open it again.", ToolTipIcon.Info);
        }
        else { reallyClose = true; Close(); }
    }

    async void Boot()
    {
        string url = null;
        try
        {
            int port = await Task.Run(() => Launcher.EnsureBackend());
            if (port == 0) { MessageBox.Show("BlockHost could not start. Details: data\\logs\\app.log", "BlockHost", MessageBoxButtons.OK, MessageBoxIcon.Error); Close(); return; }
            url = "http://127.0.0.1:" + port + "/?boot=" + Launcher.Boot;
            web = new WebView2();
            web.Dock = DockStyle.Fill; web.DefaultBackgroundColor = BackColor;
            CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Launcher.Root, "data\\webview"));
            await web.EnsureCoreWebView2Async(env);
            CoreWebView2 core = web.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            // Only the local backend may load inside the window; every other link opens in the default browser.
            core.NavigationStarting += delegate (object s, CoreWebView2NavigationStartingEventArgs e)
            {
                Uri u; if (Uri.TryCreate(e.Uri, UriKind.Absolute, out u) && u.Host != "127.0.0.1") { e.Cancel = true; OpenExternal(e.Uri); }
            };
            core.NewWindowRequested += delegate (object s, CoreWebView2NewWindowRequestedEventArgs e) { e.Handled = true; OpenExternal(e.Uri); };
            core.WindowCloseRequested += delegate { reallyClose = true; Close(); }; // the page asked (Quit): really close
            core.NavigationCompleted += delegate { status.Visible = false; };
            Controls.Add(web); web.BringToFront();
            core.Navigate(url);
        }
        catch (Exception)
        {
            // WebView2 runtime missing or failed: use an Edge/Chrome app window instead.
            try { if (url != null) Launcher.OpenBrowserApp(url); } catch { }
            Close();
        }
    }

    static void OpenExternal(string uri)
    {
        Uri u; if (!Uri.TryCreate(uri, UriKind.Absolute, out u) || (u.Scheme != "https" && u.Scheme != "http")) return;
        try { Process.Start(new ProcessStartInfo(u.AbsoluteUri) { UseShellExecute = true }); } catch { }
    }
}
