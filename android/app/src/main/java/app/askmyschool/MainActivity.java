package app.askmyschool;

import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // The web view's cookies are written to disk only periodically. Supabase
    // refresh tokens are single-use, so if the app is killed in the background
    // before a rotated session cookie is saved, the next launch would present
    // the old token and be signed out. Save them whenever the app leaves the
    // foreground.
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
