#!/usr/bin/env python3
"""Native WebKitGTK window for npm run start:window. Args: url title icon."""
import os
import sys


def probe():
    last = None
    try:
        import gi
    except ImportError as error:
        sys.stderr.write("WebKitGTK GI not available: %s\n" % error)
        sys.exit(1)
    for ns, ver, gtk in (
        ("WebKit2", "4.1", "3.0"),
        ("WebKit2", "4.0", "3.0"),
        ("WebKit", "6.0", "4.0"),
    ):
        try:
            gi.require_version("Gtk", gtk)
            gi.require_version(ns, ver)
            if ns == "WebKit2":
                from gi.repository import Gtk, WebKit2  # noqa: F401
            else:
                from gi.repository import Gtk, WebKit  # noqa: F401
            return
        except (ValueError, ImportError) as error:
            last = error
    sys.stderr.write("WebKitGTK GI not available: %s\n" % last)
    sys.exit(1)


def load_gi():
    last = None
    try:
        import gi
    except ImportError as error:
        sys.stderr.write("WebKitGTK GI not available: %s\n" % error)
        sys.exit(1)
    for ns, ver, gtk in (
        ("WebKit2", "4.1", "3.0"),
        ("WebKit2", "4.0", "3.0"),
        ("WebKit", "6.0", "4.0"),
    ):
        try:
            gi.require_version("Gtk", gtk)
            gi.require_version(ns, ver)
            if ns == "WebKit2":
                from gi.repository import Gtk, WebKit2 as WebKit
            else:
                from gi.repository import Gtk, WebKit
            return Gtk, WebKit, gtk
        except (ValueError, ImportError) as error:
            last = error
    sys.stderr.write("WebKitGTK GI not available: %s\n" % last)
    sys.exit(1)


def set_icon(win, icon):
    if not icon or not os.path.isfile(icon):
        return
    try:
        win.set_icon_from_file(icon)
    except Exception:
        pass


def run_gtk3(Gtk, WebKit, url, title, icon):
    win = Gtk.Window()
    win.set_title(title)
    win.set_default_size(1440, 900)
    win.set_size_request(800, 600)
    set_icon(win, icon)
    web = WebKit.WebView()
    web.load_uri(url)
    win.add(web)
    win.connect("destroy", Gtk.main_quit)
    win.show_all()
    Gtk.main()


def run_gtk4(Gtk, WebKit, url, title, icon):
    def on_activate(app):
        win = Gtk.ApplicationWindow(application=app)
        win.set_title(title)
        win.set_default_size(1440, 900)
        set_icon(win, icon)
        web = WebKit.WebView()
        web.load_uri(url)
        win.set_child(web)
        win.connect("close-request", lambda *_: app.quit() or False)
        win.present()

    app = Gtk.Application(application_id="com.local-workspace-management.overview")
    app.connect("activate", on_activate)
    app.run(None)


def main(argv):
    if len(argv) > 1 and argv[1] == "--check":
        probe()
        return 0
    url = argv[1] if len(argv) > 1 else "http://127.0.0.1:4174"
    title = argv[2] if len(argv) > 2 else "Workspace Overview"
    icon = argv[3] if len(argv) > 3 else ""
    Gtk, WebKit, gtk = load_gi()
    if hasattr(Gtk, "init_check"):
        ok = Gtk.init_check()
        if isinstance(ok, tuple):
            ok = ok[0]
        if not ok:
            sys.stderr.write("A display is required (WSL needs WSLg or X11).\n")
            return 1
    if gtk == "3.0":
        run_gtk3(Gtk, WebKit, url, title, icon)
    else:
        run_gtk4(Gtk, WebKit, url, title, icon)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
