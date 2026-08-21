/* Native GTK3 + WebKit2 window for npm run start:window. Args: url title icon. */
#include <gtk/gtk.h>
#include <webkit2/webkit2.h>

int main(int argc, char **argv) {
  const char *url = argc > 1 ? argv[1] : "http://127.0.0.1:4174";
  const char *title = argc > 2 ? argv[2] : "Workspace Overview";
  const char *icon = argc > 3 ? argv[3] : "";

  gtk_init(&argc, &argv);

  GtkWidget *window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
  gtk_window_set_title(GTK_WINDOW(window), title);
  gtk_window_set_default_size(GTK_WINDOW(window), 1440, 900);
  gtk_widget_set_size_request(window, 800, 600);
  if (icon && icon[0]) {
    gtk_window_set_icon_from_file(GTK_WINDOW(window), icon, NULL);
  }

  GtkWidget *webview = webkit_web_view_new();
  webkit_web_view_load_uri(WEBKIT_WEB_VIEW(webview), url);
  gtk_container_add(GTK_CONTAINER(window), webview);
  g_signal_connect(window, "destroy", G_CALLBACK(gtk_main_quit), NULL);
  gtk_widget_show_all(window);
  gtk_main();
  return 0;
}
