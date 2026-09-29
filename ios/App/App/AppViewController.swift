import UIKit
import Capacitor

/// Capacitor's view controller, plus the plugins that live in this app target
/// rather than in npm packages.
class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(AuthSessionPlugin())
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
