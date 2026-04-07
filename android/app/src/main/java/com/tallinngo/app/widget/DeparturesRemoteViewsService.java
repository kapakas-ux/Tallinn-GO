package com.tallinngo.app.widget;

import android.content.Intent;
import android.widget.RemoteViewsService;

public class DeparturesRemoteViewsService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new DeparturesRemoteViewsFactory(getApplicationContext(), intent);
    }
}
