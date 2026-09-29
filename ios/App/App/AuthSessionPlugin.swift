import AuthenticationServices
import Capacitor

/// Opens Blackbaud sign-in in Apple's system sign-in sheet
/// (ASWebAuthenticationSession) and returns the app.askmyschool:// URL it
/// finishes on. Called from lib/native/blackbaud-sign-in.ts as
/// `AuthSession.start({ url, callbackScheme })`.
@objc(AuthSessionPlugin)
public class AuthSessionPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "AuthSessionPlugin"
    public let jsName = "AuthSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
    ]

    private var session: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard
            let urlString = call.getString("url"),
            let url = URL(string: urlString),
            let callbackScheme = call.getString("callbackScheme")
        else {
            call.reject("url and callbackScheme are required")
            return
        }

        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackScheme
            ) { [weak self] callbackURL, error in
                self?.session = nil

                if let callbackURL = callbackURL {
                    call.resolve(["url": callbackURL.absoluteString])
                } else if let error = error as? ASWebAuthenticationSessionError,
                          error.code == .canceledLogin {
                    call.reject("Sign-in was cancelled", "CANCELLED")
                } else {
                    call.reject(error?.localizedDescription ?? "Sign-in failed")
                }
            }

            session.presentationContextProvider = self
            // A private session: no "wants to use blackbaud.com to sign in"
            // prompt, and nothing left behind in Safari. Parents sign in to
            // Blackbaud once; the app keeps them signed in after that.
            session.prefersEphemeralWebBrowserSession = true
            self.session = session

            if !session.start() {
                self.session = nil
                call.reject("Could not open the sign-in sheet")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.webView?.window ?? ASPresentationAnchor()
    }
}
