import { els } from "./dom.js";
import { THEME_COLORS, currentTheme, persistTheme } from "./util.js";

export function syncThemeButtons() {
  const theme = currentTheme();
  if (els.setupThemeLight) els.setupThemeLight.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
  if (els.setupThemeDark) els.setupThemeDark.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
}

export function applyTheme(theme, persist = false) {
  const next = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLORS[next];
  syncThemeButtons();
  if (persist) persistTheme(next);
}
