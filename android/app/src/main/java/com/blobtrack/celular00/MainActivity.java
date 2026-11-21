package com.blobtrack.celular00;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebViewClientCompat;

public final class MainActivity extends Activity {
  private static final int CAMERA_PERMISSION = 7301;
  private static final String APP_HOST = "appassets.androidplatform.net";
  private WebView webView;
  private PermissionRequest pendingCameraRequest;
  private int previousSystemUi;
  private WebChromeClient.CustomViewCallback fullscreenCallback;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().setStatusBarColor(Color.rgb(9, 11, 16));
    getWindow().setNavigationBarColor(Color.rgb(9, 11, 16));

    WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
      .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
      .build();

    webView = new WebView(this);
    webView.setBackgroundColor(Color.rgb(9, 11, 16));
    webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

    webView.setWebViewClient(new WebViewClientCompat() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        return assetLoader.shouldInterceptRequest(request.getUrl());
      }

      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return !isAppOrigin(request.getUrl());
      }
    });
    if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)) {
      ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(
        new ServiceWorkerClientCompat() {
          @Override
          public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
            return assetLoader.shouldInterceptRequest(request.getUrl());
          }
        }
      );
    }

    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public void onPermissionRequest(PermissionRequest request) {
        runOnUiThread(() -> handleWebPermission(request));
      }

      @Override
      public void onPermissionRequestCanceled(PermissionRequest request) {
        if (pendingCameraRequest == request) pendingCameraRequest = null;
      }

      @Override
      public void onShowCustomView(View view, CustomViewCallback callback) {
        if (fullscreenCallback != null) fullscreenCallback.onCustomViewHidden();
        fullscreenCallback = callback;
        enterImmersiveMode();
      }

      @Override
      public void onHideCustomView() {
        leaveImmersiveMode();
      }
    });

    setContentView(webView);
    webView.loadUrl("https://" + APP_HOST + "/assets/index.html");
  }

  private void handleWebPermission(PermissionRequest request) {
    if (!isAppOrigin(request.getOrigin())) {
      request.deny();
      return;
    }

    String[] resources = request.getResources();
    if (resources.length != 1 || !PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resources[0])) {
      request.deny();
      return;
    }

    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
      request.grant(resources);
      return;
    }

    if (pendingCameraRequest != null) pendingCameraRequest.deny();
    pendingCameraRequest = request;
    requestPermissions(new String[] { Manifest.permission.CAMERA }, CAMERA_PERMISSION);
  }

  private boolean isAppOrigin(Uri origin) {
    return origin != null
      && "https".equals(origin.getScheme())
      && APP_HOST.equals(origin.getHost());
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
    super.onRequestPermissionsResult(requestCode, permissions, results);
    if (requestCode != CAMERA_PERMISSION || pendingCameraRequest == null) return;

    PermissionRequest request = pendingCameraRequest;
    pendingCameraRequest = null;
    if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED
        && isAppOrigin(request.getOrigin())) {
      request.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
    } else {
      request.deny();
    }
  }

  private void enterImmersiveMode() {
    Window window = getWindow();
    View decor = window.getDecorView();
    previousSystemUi = decor.getSystemUiVisibility();
    decor.setSystemUiVisibility(
      View.SYSTEM_UI_FLAG_FULLSCREEN
        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    );
  }

  private void leaveImmersiveMode() {
    getWindow().getDecorView().setSystemUiVisibility(previousSystemUi);
    if (fullscreenCallback != null) {
      fullscreenCallback.onCustomViewHidden();
      fullscreenCallback = null;
    }
  }

  @Override
  public void onBackPressed() {
    if (fullscreenCallback != null) {
      leaveImmersiveMode();
      return;
    }
    super.onBackPressed();
  }

  @Override
  protected void onDestroy() {
    if (pendingCameraRequest != null) {
      pendingCameraRequest.deny();
      pendingCameraRequest = null;
    }
    if (webView != null) {
      webView.stopLoading();
      webView.destroy();
      webView = null;
    }
    super.onDestroy();
  }
}
