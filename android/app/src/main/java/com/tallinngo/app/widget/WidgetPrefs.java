package com.tallinngo.app.widget;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Stores widget configuration: which stops to show for each widget instance.
 */
public class WidgetPrefs {
    private static final String PREFS_NAME = "com.tallinngo.app.widget.prefs";
    private static final String KEY_STOP_IDS = "stop_ids_";
    private static final String KEY_STOP_NAMES = "stop_names_";

    public static void saveStops(Context context, int appWidgetId, String[] stopIds, String[] stopNames) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString(KEY_STOP_IDS + appWidgetId, join(stopIds));
        editor.putString(KEY_STOP_NAMES + appWidgetId, join(stopNames));
        editor.apply();
    }

    public static String[] getStopIds(Context context, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_STOP_IDS + appWidgetId, "");
        if (raw.isEmpty()) return new String[0];
        return raw.split("\\|");
    }

    public static String[] getStopNames(Context context, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_STOP_NAMES + appWidgetId, "");
        if (raw.isEmpty()) return new String[0];
        return raw.split("\\|");
    }

    public static String getTitle(Context context, int appWidgetId) {
        String[] names = getStopNames(context, appWidgetId);
        if (names.length == 0) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < names.length; i++) {
            if (i > 0) sb.append(" · ");
            sb.append(names[i]);
        }
        return sb.toString();
    }

    public static void clearPrefs(Context context, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.remove(KEY_STOP_IDS + appWidgetId);
        editor.remove(KEY_STOP_NAMES + appWidgetId);
        editor.apply();
    }

    private static String join(String[] arr) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < arr.length; i++) {
            if (i > 0) sb.append("|");
            sb.append(arr[i]);
        }
        return sb.toString();
    }
}
