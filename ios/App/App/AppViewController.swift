import UIKit
import WebKit
import Capacitor

/// Capacitor's view controller, plus the plugins that live in this app target
/// rather than in npm packages, pull-to-refresh, and the offline page.
class BridgeViewController: CAPBridgeViewController {
    private let navigationErrorFilter = NavigationErrorFilter()

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(AuthSessionPlugin())
        installNavigationErrorFilter()
        installPullToRefresh()
    }

    // MARK: Offline page

    /// Capacitor shows `server.errorPath` (mobile/www/index.html, "You're
    /// offline") for *any* failed navigation, including ones that were simply
    /// cancelled or superseded by another tap. Sit in front of its navigation
    /// delegate and pass on only real failures.
    private func installNavigationErrorFilter() {
        guard let webView = webView else { return }
        navigationErrorFilter.target = webView.navigationDelegate
        webView.navigationDelegate = navigationErrorFilter
    }

    // MARK: Pull to refresh

    private func installPullToRefresh() {
        guard let scrollView = webView?.scrollView else { return }
        let refreshControl = UIRefreshControl()
        refreshControl.addTarget(self, action: #selector(pullToRefresh(_:)), for: .valueChanged)
        // Capacitor turns bouncing off; the refresh control needs it.
        scrollView.bounces = true
        scrollView.alwaysBounceVertical = true
        scrollView.refreshControl = refreshControl
    }

    /// Pages define window.__amsRefresh (components/native/native-shell.tsx:
    /// re-fetch server data, keep what's on screen; the offline page: try to
    /// reconnect). A full reload is only the fallback.
    @objc private func pullToRefresh(_ sender: UIRefreshControl) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        let script = """
        (function () {
          if (typeof window.__amsRefresh === "function") { window.__amsRefresh(); }
          else { window.location.reload(); }
          return true;
        })()
        """
        webView?.evaluateJavaScript(script) { _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                sender.endRefreshing()
            }
        }
    }
}

/// Forwards every navigation-delegate call to Capacitor's handler, except
/// failures that don't mean "the site can't be reached".
final class NavigationErrorFilter: NSObject, WKNavigationDelegate {
    weak var target: WKNavigationDelegate?

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (target?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if let target = target, target.responds(to: aSelector) {
            return target
        }
        return super.forwardingTarget(for: aSelector)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard !Self.isBenign(error) else { return }
        target?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard !Self.isBenign(error) else { return }
        target?.webView?(webView, didFail: navigation, withError: error)
    }

    /// Cancelled (a newer navigation replaced it), handed off to another app
    /// or the in-app browser, or a download: none of these are "offline".
    static func isBenign(_ error: Error) -> Bool {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
            return true
        }
        // WebKitErrorDomain 102: frame load interrupted by policy change;
        // 204: plug-in handled load.
        return nsError.domain == "WebKitErrorDomain" && (nsError.code == 102 || nsError.code == 204)
    }
}

/// The site draws edge to edge (viewport-fit=cover) for mobile Safari, which
/// puts headers under the status bar and Dynamic Island in the app. Rather
/// than change every page, the app hosts Capacitor's web view as a child
/// pinned below the top safe area, and fills the strip behind the status bar
/// with the site's cream.
///
/// A container is needed because CAPBridgeViewController's root view *is* the
/// web view, so it can't be inset from inside.
class AppViewController: UIViewController {
    // The site's --background (#faf8f5).
    private static let statusBarBackground = UIColor(
        red: 250 / 255, green: 248 / 255, blue: 245 / 255, alpha: 1
    )

    private let bridgeViewController = BridgeViewController()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Self.statusBarBackground

        addChild(bridgeViewController)
        let webContainer: UIView = bridgeViewController.view
        webContainer.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webContainer)

        // Only the top is inset: the bottom still runs under the home
        // indicator, where pages already pad with env(safe-area-inset-bottom).
        NSLayoutConstraint.activate([
            webContainer.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webContainer.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webContainer.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webContainer.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        bridgeViewController.didMove(toParent: self)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        .darkContent
    }
}
