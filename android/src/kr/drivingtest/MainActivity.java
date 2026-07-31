package kr.drivingtest;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// 웹으로 만든 시뮬레이터를 전체 화면 WebView 로 감싼다.
// 자산은 assets/www 아래에 그대로 들어 있어 오프라인으로 동작한다.
//
// 리소스(res/)를 쓰지 않는다. 이 프로젝트는 aapt2 없이 빌드하기 때문에
// 테마·타이틀바 제거를 XML 이 아니라 코드로 처리한다.
public class MainActivity extends Activity {

    private WebView web;

    @Override
    protected void onCreate(Bundle saved) {
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        super.onCreate(saved);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        if (Build.VERSION.SDK_INT >= 21) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        web.setWebViewClient(new WebViewClient());
        web.setBackgroundColor(0xFF0B1017);
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");
    }

    // 노치 아래까지 쓰고 상태바·내비게이션바를 숨긴다.
    @Override
    public void onWindowFocusChanged(boolean has) {
        super.onWindowFocusChanged(has);
        if (!has) return;
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = 1;   // SHORT_EDGES
            getWindow().setAttributes(lp);
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
