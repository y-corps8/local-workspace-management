/**
 * Apply stored Light / Dark before first paint. Classic (non-module) script
 * in <head> so CSP can stay script-src 'self' with no unsafe-inline.
 */
try {
  var theme = localStorage.getItem("overview.theme");
  if (theme === "light" || theme === "dark") {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    if (theme === "light") {
      var themeColor = document.querySelector('meta[name="theme-color"]');
      if (themeColor) themeColor.content = "#f6f3eb";
    }
  }
} catch (e) {}
