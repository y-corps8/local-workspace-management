// Native WebView2 window for npm run start:window. Args: url title icon
// Compiles with Framework csc.exe. No NuGet. C# 5.
using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;

[ComImport, Guid("4E8A3389-C9D8-4BD2-B6B5-124FEE6CC14D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler
{
    [PreserveSig]
    int Invoke(int errorCode, IntPtr createdEnvironment);
}

[ComImport, Guid("6C4819F3-C9B7-4260-8127-C9F5BDE7F68C"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICoreWebView2CreateCoreWebView2ControllerCompletedHandler
{
    [PreserveSig]
    int Invoke(int errorCode, IntPtr createdController);
}

[ComImport, Guid("B96D53E9-EE23-4A2B-A795-08A8F4B73B61"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICoreWebView2Environment
{
    void CreateCoreWebView2Controller(IntPtr parentWindow, ICoreWebView2CreateCoreWebView2ControllerCompletedHandler handler);
}

[StructLayout(LayoutKind.Sequential)]
struct RECT
{
    public int left;
    public int top;
    public int right;
    public int bottom;
}

[StructLayout(LayoutKind.Sequential)]
struct EventRegistrationToken
{
    public long value;
}

[ComImport, Guid("4D00C0D1-9434-4EB6-807A-1952A0A9C0A1"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICoreWebView2Controller
{
    void get_IsVisible(out int isVisible);
    void put_IsVisible(int isVisible);
    void get_Bounds(out RECT bounds);
    void put_Bounds(RECT bounds);
    void get_ZoomFactor(out double zoomFactor);
    void put_ZoomFactor(double zoomFactor);
    void add_ZoomFactorChanged(IntPtr handler, out EventRegistrationToken token);
    void remove_ZoomFactorChanged(EventRegistrationToken token);
    void SetBoundsAndZoomFactor(RECT bounds, double zoomFactor);
    void MoveFocus(int reason);
    void add_MoveFocusRequested(IntPtr handler, out EventRegistrationToken token);
    void remove_MoveFocusRequested(EventRegistrationToken token);
    void add_GotFocus(IntPtr handler, out EventRegistrationToken token);
    void remove_GotFocus(EventRegistrationToken token);
    void add_LostFocus(IntPtr handler, out EventRegistrationToken token);
    void remove_LostFocus(EventRegistrationToken token);
    void add_AcceleratorKeyPressed(IntPtr handler, out EventRegistrationToken token);
    void remove_AcceleratorKeyPressed(EventRegistrationToken token);
    void get_ParentWindow(out IntPtr parentWindow);
    void put_ParentWindow(IntPtr parentWindow);
    void NotifyParentWindowPositionChanged();
    void Close();
    void get_CoreWebView2(out ICoreWebView2 coreWebView2);
}

[ComImport, Guid("76ECEACB-0462-4D94-AC83-423A6793775E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ICoreWebView2
{
    void get_Settings(out IntPtr settings);
    void get_Source(out IntPtr uri);
    void Navigate([MarshalAs(UnmanagedType.LPWStr)] string uri);
}

[UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet = CharSet.Unicode)]
delegate int CreateWebViewEnvironmentWithOptionsInternal(
    [MarshalAs(UnmanagedType.U1)] bool unused,
    int runtimeType,
    [MarshalAs(UnmanagedType.LPWStr)] string userDataFolder,
    IntPtr envOptions,
    ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler handler);

[ComVisible(true)]
[ClassInterface(ClassInterfaceType.None)]
sealed class EnvHandler : ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler
{
    readonly IntPtr hwnd;
    readonly ControllerHandler controllerHandler;

    public EnvHandler(IntPtr hwnd, ControllerHandler controllerHandler)
    {
        this.hwnd = hwnd;
        this.controllerHandler = controllerHandler;
    }

    public int Invoke(int errorCode, IntPtr createdEnvironment)
    {
        if (errorCode != 0 || createdEnvironment == IntPtr.Zero)
        {
            Console.Error.WriteLine("WebView2 environment failed: " + errorCode);
            Environment.Exit(1);
            return 0;
        }
        ICoreWebView2Environment env = (ICoreWebView2Environment)Marshal.GetObjectForIUnknown(createdEnvironment);
        env.CreateCoreWebView2Controller(hwnd, controllerHandler);
        return 0;
    }
}

[ComVisible(true)]
[ClassInterface(ClassInterfaceType.None)]
sealed class ControllerHandler : ICoreWebView2CreateCoreWebView2ControllerCompletedHandler
{
    readonly Form form;
    readonly string url;
    public ICoreWebView2Controller Controller;

    public ControllerHandler(Form form, string url)
    {
        this.form = form;
        this.url = url;
    }

    public int Invoke(int errorCode, IntPtr createdController)
    {
        if (errorCode != 0 || createdController == IntPtr.Zero)
        {
            Console.Error.WriteLine("WebView2 controller failed: " + errorCode);
            Environment.Exit(1);
            return 0;
        }
        Controller = (ICoreWebView2Controller)Marshal.GetObjectForIUnknown(createdController);
        ICoreWebView2 webview;
        Controller.get_CoreWebView2(out webview);
        Controller.put_IsVisible(1);
        ResizeToForm();
        webview.Navigate(url);
        return 0;
    }

    public void ResizeToForm()
    {
        if (Controller == null) return;
        RECT bounds = new RECT();
        bounds.left = 0;
        bounds.top = 0;
        bounds.right = form.ClientSize.Width;
        bounds.bottom = form.ClientSize.Height;
        Controller.put_Bounds(bounds);
    }
}

static class Native
{
    [DllImport("kernel32", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr LoadLibrary(string path);

    [DllImport("kernel32", CharSet = CharSet.Ansi, ExactSpelling = true, SetLastError = true)]
    public static extern IntPtr GetProcAddress(IntPtr module, string name);

    static string WebViewArch()
    {
        string a = (Environment.GetEnvironmentVariable("PROCESSOR_ARCHITECTURE") ?? "").ToUpperInvariant();
        if (a == "ARM64") return "arm64";
        if (IntPtr.Size == 4) return "x86";
        return "x64";
    }

    static string FindEbWebView()
    {
        string sub = @"SOFTWARE\Microsoft\EdgeUpdate\ClientState\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
        RegistryHive[] hives = new RegistryHive[] { RegistryHive.LocalMachine, RegistryHive.CurrentUser };
        for (int i = 0; i < hives.Length; i++)
        {
            using (RegistryKey baseKey = RegistryKey.OpenBaseKey(hives[i], RegistryView.Registry32))
            using (RegistryKey key = baseKey.OpenSubKey(sub))
            {
                if (key == null) continue;
                string val = key.GetValue("EBWebView") as string;
                if (!string.IsNullOrEmpty(val)) return val;
            }
        }
        return null;
    }

    public static CreateWebViewEnvironmentWithOptionsInternal LoadCreator()
    {
        string dir = FindEbWebView();
        if (string.IsNullOrEmpty(dir)) return null;
        string dll = Path.Combine(dir, "EBWebView", WebViewArch(), "EmbeddedBrowserWebView.dll");
        if (!File.Exists(dll)) return null;
        IntPtr mod = LoadLibrary(dll);
        if (mod == IntPtr.Zero) return null;
        IntPtr proc = GetProcAddress(mod, "CreateWebViewEnvironmentWithOptionsInternal");
        if (proc == IntPtr.Zero) return null;
        return (CreateWebViewEnvironmentWithOptionsInternal)Marshal.GetDelegateForFunctionPointer(
            proc, typeof(CreateWebViewEnvironmentWithOptionsInternal));
    }
}

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        string url = args.Length > 0 ? args[0] : "http://127.0.0.1:4174";
        string title = args.Length > 1 ? args[1] : "Workspace Overview";
        string icon = args.Length > 2 ? args[2] : "";

        CreateWebViewEnvironmentWithOptionsInternal create = Native.LoadCreator();
        if (create == null)
        {
            MessageBox.Show(
                "WebView2 runtime not found. Install it from https://developer.microsoft.com/en-us/microsoft-edge/webview2/",
                title);
            Environment.Exit(1);
            return;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        Form form = new Form();
        form.Text = title;
        form.StartPosition = FormStartPosition.CenterScreen;
        form.Size = new Size(1440, 900);
        form.MinimumSize = new Size(800, 600);
        if (!string.IsNullOrEmpty(icon) && File.Exists(icon))
        {
            try
            {
                if (icon.EndsWith(".ico", StringComparison.OrdinalIgnoreCase))
                    form.Icon = new Icon(icon);
                else
                    form.Icon = Icon.FromHandle(new Bitmap(icon).GetHicon());
            }
            catch
            {
            }
        }

        ControllerHandler controllerHandler = new ControllerHandler(form, url);
        EnvHandler envHandler = new EnvHandler(form.Handle, controllerHandler);
        form.Resize += delegate { controllerHandler.ResizeToForm(); };

        string userData = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "overview-webview2");
        Directory.CreateDirectory(userData);
        int hr = create(true, 0, userData, IntPtr.Zero, envHandler);
        if (hr != 0)
        {
            MessageBox.Show("WebView2 failed to start (HRESULT " + hr + ").", title);
            Environment.Exit(1);
            return;
        }

        Application.Run(form);
    }
}
