package com.tallinngo.app.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import com.tallinngo.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class DeparturesRemoteViewsFactory implements RemoteViewsService.RemoteViewsFactory {

    private static final String PEATUS_URL = "https://api.peatus.ee/routing/v1/routers/estonia/index/graphql";
    private static final String[] CITY_AGENCIES = {
            "tallinna linnatransport", "gobus", "sebe"
    };

    private final Context context;
    private final int appWidgetId;
    private final List<DepartureItem> items = new ArrayList<>();

    // View types
    private static final int TYPE_HEADER = 0;
    private static final int TYPE_DEPARTURE = 1;

    DeparturesRemoteViewsFactory(Context context, Intent intent) {
        this.context = context;
        this.appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID);
    }

    @Override
    public void onCreate() {
        // Data loaded in onDataSetChanged
    }

    @Override
    public void onDataSetChanged() {
        items.clear();
        String[] stopIds = WidgetPrefs.getStopIds(context, appWidgetId);
        String[] stopNames = WidgetPrefs.getStopNames(context, appWidgetId);

        for (int i = 0; i < stopIds.length; i++) {
            String stopId = stopIds[i];
            String stopName = (i < stopNames.length) ? stopNames[i] : stopId;
            if (stopId.isEmpty()) continue;

            // Add header
            items.add(DepartureItem.header(stopName));

            // Fetch departures
            List<DepartureItem> departures = fetchDepartures(stopId);
            if (departures.isEmpty()) {
                items.add(DepartureItem.departure("—", "No departures", "", R.drawable.line_badge_bus));
            } else {
                items.addAll(departures);
            }
        }
    }

    private List<DepartureItem> fetchDepartures(String stopGtfsId) {
        List<DepartureItem> result = new ArrayList<>();
        try {
            long nowSeconds = System.currentTimeMillis() / 1000;
            String query = "{ stop(id: \"estonia:" + stopGtfsId + "\") { " +
                    "stoptimesWithoutPatterns(numberOfDepartures: 6, startTime: " + (nowSeconds - 60) + ") { " +
                    "scheduledDeparture realtimeDeparture realtime realtimeState headsign serviceDay " +
                    "trip { route { shortName mode agency { name } } } } } }";

            String jsonBody = new JSONObject().put("query", query).toString();

            URL url = new URL(PEATUS_URL);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setDoOutput(true);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
            }

            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) {
                    sb.append(line);
                }
            }

            JSONObject data = new JSONObject(sb.toString());
            JSONObject stop = data.optJSONObject("data");
            if (stop == null) return result;
            stop = stop.optJSONObject("stop");
            if (stop == null) return result;

            JSONArray stoptimes = stop.optJSONArray("stoptimesWithoutPatterns");
            if (stoptimes == null) return result;

            for (int i = 0; i < stoptimes.length() && result.size() < 5; i++) {
                JSONObject st = stoptimes.getJSONObject(i);

                String state = st.optString("realtimeState", "");
                if ("DEPARTED".equals(state) || "CANCELED".equals(state)) continue;

                long serviceDay = st.optLong("serviceDay", 0);
                long departure = st.has("realtimeDeparture") && st.optBoolean("realtime", false)
                        ? st.optLong("realtimeDeparture", 0)
                        : st.optLong("scheduledDeparture", 0);
                long departureEpoch = serviceDay + departure;
                long diffSeconds = departureEpoch - nowSeconds;

                if (diffSeconds < -60) continue;

                int minutes = Math.max(0, (int) (diffSeconds / 60));
                String minutesStr = minutes == 0 ? "Now" : minutes + " min";

                JSONObject trip = st.optJSONObject("trip");
                JSONObject route = (trip != null) ? trip.optJSONObject("route") : null;
                String shortName = (route != null) ? route.optString("shortName", "?") : "?";
                String mode = (route != null) ? route.optString("mode", "BUS") : "BUS";
                String destination = st.optString("headsign", "");

                // Get agency
                String agencyName = "";
                if (route != null) {
                    JSONObject agency = route.optJSONObject("agency");
                    if (agency != null) agencyName = agency.optString("name", "");
                }

                int badgeRes = getBadgeDrawable(mode, agencyName);

                result.add(DepartureItem.departure(shortName, destination, minutesStr, badgeRes));
            }

            conn.disconnect();
        } catch (Exception e) {
            // Network error — show a placeholder
            result.add(DepartureItem.departure("!", "Connection error", "", R.drawable.line_badge_bus));
        }
        return result;
    }

    private int getBadgeDrawable(String mode, String agencyName) {
        String modeLower = mode.toLowerCase();
        if (modeLower.contains("tram")) return R.drawable.line_badge_tram;
        if (modeLower.contains("trolley")) return R.drawable.line_badge_trolley;
        if (modeLower.contains("rail") || modeLower.contains("train")) return R.drawable.line_badge_train;

        // Bus: check if city or regional
        String agencyLower = agencyName.toLowerCase();
        for (String cityAgency : CITY_AGENCIES) {
            if (agencyLower.contains(cityAgency)) return R.drawable.line_badge_bus;
        }
        if (!agencyName.isEmpty()) return R.drawable.line_badge_regional;
        return R.drawable.line_badge_bus;
    }

    @Override
    public void onDestroy() {
        items.clear();
    }

    @Override
    public int getCount() {
        return items.size();
    }

    @Override
    public RemoteViews getViewAt(int position) {
        if (position < 0 || position >= items.size()) return null;
        DepartureItem item = items.get(position);

        if (item.isHeader) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_stop_header);
            views.setTextViewText(R.id.departure_stop_name, item.stopName);
            return views;
        } else {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_departure_item);
            views.setTextViewText(R.id.departure_line, item.line);
            views.setTextViewText(R.id.departure_destination, item.destination);
            views.setTextViewText(R.id.departure_minutes, item.minutes);
            views.setInt(R.id.departure_line, "setBackgroundResource", item.badgeRes);
            return views;
        }
    }

    @Override
    public RemoteViews getLoadingView() {
        return null;
    }

    @Override
    public int getViewTypeCount() {
        return 2; // header + departure
    }

    @Override
    public long getItemId(int position) {
        return position;
    }

    @Override
    public boolean hasStableIds() {
        return false;
    }

    /** Simple data holder for list items */
    static class DepartureItem {
        boolean isHeader;
        String stopName;
        String line;
        String destination;
        String minutes;
        int badgeRes;

        static DepartureItem header(String stopName) {
            DepartureItem item = new DepartureItem();
            item.isHeader = true;
            item.stopName = stopName;
            return item;
        }

        static DepartureItem departure(String line, String destination, String minutes, int badgeRes) {
            DepartureItem item = new DepartureItem();
            item.isHeader = false;
            item.line = line;
            item.destination = destination;
            item.minutes = minutes;
            item.badgeRes = badgeRes;
            return item;
        }
    }
}
