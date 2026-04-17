package com.tallinngo.app.widget;

import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;

import androidx.activity.EdgeToEdge;
import androidx.appcompat.app.AppCompatActivity;

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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class WidgetConfigActivity extends AppCompatActivity {

    private static final String PEATUS_URL =
            "https://api.peatus.ee/routing/v1/routers/estonia/index/graphql";

    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private final List<StopEntry> searchResults = new ArrayList<>();
    private final List<StopEntry> selectedStops = new ArrayList<>();

    private ArrayAdapter<StopEntry> adapter;
    private EditText searchField;
    private Button confirmButton;
    private LinearLayout selectedContainer;
    private TextView selectedText1;
    private TextView selectedText2;

    private Runnable pendingSearch;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);

        // Enable edge-to-edge display
        EdgeToEdge.enable(this);

        Intent intent = getIntent();
        if (intent != null) {
            appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,
                    AppWidgetManager.INVALID_APPWIDGET_ID);
        }
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        setContentView(R.layout.activity_widget_config);

        searchField = findViewById(R.id.config_search);
        ListView resultsList = findViewById(R.id.config_results);
        confirmButton = findViewById(R.id.config_confirm);
        selectedContainer = findViewById(R.id.config_selected_container);
        selectedText1 = findViewById(R.id.config_selected_1);
        selectedText2 = findViewById(R.id.config_selected_2);

        adapter = new ArrayAdapter<StopEntry>(this, R.layout.config_search_item, R.id.item_stop_name, searchResults) {
            @Override
            public View getView(int position, View convertView, ViewGroup parent) {
                View view = super.getView(position, convertView, parent);
                StopEntry entry = getItem(position);
                if (entry != null) {
                    TextView nameView = view.findViewById(R.id.item_stop_name);
                    TextView depView = view.findViewById(R.id.item_departures);
                    nameView.setText(entry.name);
                    if (entry.departureSummary != null && !entry.departureSummary.isEmpty()) {
                        depView.setVisibility(View.VISIBLE);
                        depView.setText(entry.departureSummary);
                    } else {
                        depView.setVisibility(View.GONE);
                    }
                }
                return view;
            }
        };
        resultsList.setAdapter(adapter);

        resultsList.setOnItemClickListener((parent, view, position, id) -> {
            if (position < 0 || position >= searchResults.size()) return;
            StopEntry entry = searchResults.get(position);
            addSelectedStop(entry);
        });

        searchField.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {}

            @Override
            public void afterTextChanged(Editable s) {
                String query = s.toString().trim();
                // Debounce: wait 400ms after last keystroke
                if (pendingSearch != null) {
                    mainHandler.removeCallbacks(pendingSearch);
                }
                if (query.length() >= 2) {
                    pendingSearch = () -> searchStops(query);
                    mainHandler.postDelayed(pendingSearch, 300);
                } else {
                    searchResults.clear();
                    adapter.notifyDataSetChanged();
                }
            }
        });

        confirmButton.setOnClickListener(v -> confirmWidget());

        // Long-press to remove selected stops
        selectedText1.setOnClickListener(v -> {
            if (selectedStops.size() > 0) {
                selectedStops.remove(0);
                updateSelectedUI();
            }
        });
        selectedText2.setOnClickListener(v -> {
            if (selectedStops.size() > 1) {
                selectedStops.remove(1);
                updateSelectedUI();
            }
        });
    }

    private void addSelectedStop(StopEntry entry) {
        // Check duplicate
        for (StopEntry s : selectedStops) {
            if (s.gtfsId.equals(entry.gtfsId)) return;
        }
        if (selectedStops.size() >= 2) {
            // Replace the second one
            selectedStops.set(1, entry);
        } else {
            selectedStops.add(entry);
        }
        updateSelectedUI();
    }

    private void updateSelectedUI() {
        if (selectedStops.isEmpty()) {
            selectedContainer.setVisibility(View.GONE);
            confirmButton.setEnabled(false);
            confirmButton.setAlpha(0.5f);
        } else {
            selectedContainer.setVisibility(View.VISIBLE);
            confirmButton.setEnabled(true);
            confirmButton.setAlpha(1.0f);

            selectedText1.setVisibility(View.VISIBLE);
            selectedText1.setText("✕  " + selectedStops.get(0).name);

            if (selectedStops.size() > 1) {
                selectedText2.setVisibility(View.VISIBLE);
                selectedText2.setText("✕  " + selectedStops.get(1).name);
            } else {
                selectedText2.setVisibility(View.GONE);
            }
        }
    }

    private int searchGeneration = 0;

    private void searchStops(String query) {
        final int gen = ++searchGeneration;
        executor.execute(() -> {
            List<StopEntry> results = new ArrayList<>();
            try {
                // Phase 1: fast name-only query
                String gql = "{ stops(name: \"" + sanitize(query) + "\") { gtfsId name lat lon } }";
                String jsonBody = new JSONObject().put("query", gql).toString();
                JSONArray stops = executeGraphQL(jsonBody);

                if (stops != null) {
                    List<String> seenIds = new ArrayList<>();
                    for (int i = 0; i < stops.length() && results.size() < 20; i++) {
                        JSONObject s = stops.getJSONObject(i);
                        String name = s.optString("name", "");
                        String id = s.optString("gtfsId", "").replace("estonia:", "");
                        if (name.isEmpty() || id.isEmpty()) continue;
                        if (seenIds.contains(id)) continue;
                        seenIds.add(id);
                        results.add(new StopEntry(id, name, s.optDouble("lat", 0), s.optDouble("lon", 0), ""));
                    }
                }
            } catch (Exception e) {
                // Silently fail
            }

            // Show results immediately (no departures yet)
            final List<StopEntry> phase1 = new ArrayList<>(results);
            mainHandler.post(() -> {
                if (gen != searchGeneration) return;
                searchResults.clear();
                searchResults.addAll(phase1);
                adapter.notifyDataSetChanged();
            });

            // Phase 2: enrich with departures for the displayed stops
            if (results.isEmpty() || gen != searchGeneration) return;
            try {
                long nowSeconds = System.currentTimeMillis() / 1000;
                // Build a batch query for all stop IDs
                StringBuilder gqlSb = new StringBuilder("{ ");
                for (int i = 0; i < results.size(); i++) {
                    StopEntry entry = results.get(i);
                    gqlSb.append("s").append(i).append(": stop(id: \"estonia:").append(entry.gtfsId).append("\") { ")
                          .append("gtfsId stoptimesWithoutPatterns(numberOfDepartures: 2, startTime: ")
                          .append(nowSeconds).append(") { headsign trip { route { shortName } } } } ");
                }
                gqlSb.append("}");

                String jsonBody = new JSONObject().put("query", gqlSb.toString()).toString();
                String responseStr = executeGraphQLRaw(jsonBody);
                JSONObject data = new JSONObject(responseStr).optJSONObject("data");
                if (data != null && gen == searchGeneration) {
                    for (int i = 0; i < results.size(); i++) {
                        JSONObject stopData = data.optJSONObject("s" + i);
                        if (stopData == null) continue;
                        JSONArray stoptimes = stopData.optJSONArray("stoptimesWithoutPatterns");
                        if (stoptimes == null || stoptimes.length() == 0) continue;
                        StringBuilder depSb = new StringBuilder();
                        for (int j = 0; j < stoptimes.length() && j < 2; j++) {
                            JSONObject st = stoptimes.getJSONObject(j);
                            String headsign = st.optString("headsign", "");
                            JSONObject trip = st.optJSONObject("trip");
                            JSONObject route = (trip != null) ? trip.optJSONObject("route") : null;
                            String shortName = (route != null) ? route.optString("shortName", "") : "";
                            if (shortName.isEmpty() && headsign.isEmpty()) continue;
                            if (depSb.length() > 0) depSb.append(",  ");
                            if (!shortName.isEmpty()) {
                                depSb.append(shortName);
                                if (!headsign.isEmpty()) depSb.append(" → ").append(headsign);
                            } else {
                                depSb.append(headsign);
                            }
                        }
                        results.get(i).departureSummary = depSb.toString();
                    }
                    // Update UI with enriched data
                    final List<StopEntry> phase2 = new ArrayList<>(results);
                    mainHandler.post(() -> {
                        if (gen != searchGeneration) return;
                        searchResults.clear();
                        searchResults.addAll(phase2);
                        adapter.notifyDataSetChanged();
                    });
                }
            } catch (Exception ignored) {
                // Phase 2 failure is fine — stops are already shown
            }
        });
    }

    private JSONArray executeGraphQL(String jsonBody) throws Exception {
        String raw = executeGraphQLRaw(jsonBody);
        JSONObject data = new JSONObject(raw);
        JSONObject d = data.optJSONObject("data");
        return (d != null) ? d.optJSONArray("stops") : null;
    }

    private String executeGraphQLRaw(String jsonBody) throws Exception {
        URL url = new URL(PEATUS_URL);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(8000);
        conn.setDoOutput(true);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
        }
        StringBuilder sb = new StringBuilder();
        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
        }
        conn.disconnect();
        return sb.toString();
    }

    private void confirmWidget() {
        if (selectedStops.isEmpty()) return;

        String[] ids = new String[selectedStops.size()];
        String[] names = new String[selectedStops.size()];
        for (int i = 0; i < selectedStops.size(); i++) {
            ids[i] = selectedStops.get(i).gtfsId;
            names[i] = selectedStops.get(i).name;
        }

        WidgetPrefs.saveStops(this, appWidgetId, ids, names);

        AppWidgetManager mgr = AppWidgetManager.getInstance(this);
        DeparturesWidgetProvider.updateAppWidget(this, mgr, appWidgetId);

        Intent result = new Intent();
        result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        setResult(RESULT_OK, result);
        finish();
    }

    private static String sanitize(String input) {
        // Remove characters that could break GraphQL query
        return input.replaceAll("[\"\\\\]", "");
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdownNow();
    }

    /** Simple data holder */
    static class StopEntry {
        final String gtfsId;
        final String name;
        final double lat;
        final double lon;
        String departureSummary;

        StopEntry(String gtfsId, String name, double lat, double lon, String departureSummary) {
            this.gtfsId = gtfsId;
            this.name = name;
            this.lat = lat;
            this.lon = lon;
            this.departureSummary = departureSummary;
        }

        @Override
        public String toString() {
            return name;
        }
    }
}
