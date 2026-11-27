import type { auth as en } from "../en/auth";

export const auth: Record<keyof typeof en, string> = {
  // ── Shared ────────────────────────────────────────────────────────────
  "auth.signIn": "Iniciar sesión",
  "auth.signingIn": "Iniciando sesión…",
  "auth.signingYouIn": "Iniciando su sesión…",
  "auth.signOut": "Cerrar sesión",
  "auth.signingOut": "Cerrando sesión…",
  "auth.loading": "Cargando…",
  "auth.back": "Volver",
  "auth.continue": "Continuar",
  "auth.poweredBy": "Con la tecnología de AskMySchool",
  "auth.yourSchool": "su escuela",

  // ── School login page ─────────────────────────────────────────────────
  "auth.parentSignIn": "Padres y tutores",
  "auth.staffSignIn": "Personal escolar",
  "auth.staffSubheading": "Para administradores de la escuela.",
  "auth.parentSignInUnavailable":
    "El inicio de sesión para padres no está disponible aquí en este momento.",
  "auth.subheadingNamed": "Inicie sesión con su cuenta de {provider} de {school}.",
  "auth.subheadingUnnamed": "Inicie sesión con la cuenta de {provider} de su escuela.",
  "auth.portalHint":
    "Use los mismos datos de acceso del {portal} de {possessive}. Solo pueden iniciar sesión padres y tutores.",
  "auth.portal.blackbaud": "portal para padres de Blackbaud",
  "auth.portal.veracross": "portal de Veracross",
  "auth.portal.roster": "escuela",
  "auth.notSetUp":
    "El inicio de sesión para padres no está configurado para {school}. Comuníquese con la escuela para obtener ayuda.",
  "auth.notEnabledNamed":
    "{school} aún no ha activado el inicio de sesión con {provider}. Vuelva a intentarlo pronto.",
  "auth.notEnabledUnnamed":
    "Su escuela aún no ha activado el inicio de sesión con {provider}. Vuelva a intentarlo pronto.",
  "auth.signInWith": "Iniciar sesión con {provider}",
  "auth.redirectingTo": "Redirigiendo a {provider}…",
  "auth.continueWithGoogle": "Continuar con Google",
  "auth.redirectingToGoogle": "Redirigiendo a Google…",
  "auth.or": "o",
  "auth.adminsSignInWithGoogle": "Los administradores inician sesión con Google.",
  "auth.parentPasswordLink":
    "¿Es padre o tutor y tiene contraseña? Inicie sesión con correo electrónico y contraseña",
  "auth.parentPasswordNote":
    "Para cuentas de padres que tienen una contraseña de AskMySchool. Los administradores inician sesión con Google.",
  "auth.adminSignInUnavailable":
    "El inicio de sesión de administradores no está disponible en este momento. Comuníquese con el soporte de AskMySchool.",
  "auth.staffSignInLink": "Inicio de sesión del personal escolar",
  "auth.backToParentSignIn": "Volver al inicio de sesión para padres",
  "auth.email": "Correo electrónico",
  "auth.emailPlaceholder": "nombre@escuela.org",
  "auth.password": "Contraseña",
  "auth.passwordPlaceholder": "Ingrese su contraseña",
  "auth.legalPrefix": "Al iniciar sesión, acepta nuestros",
  "auth.legalTerms": "Términos del servicio",
  "auth.legalAnd": "y nuestra",
  "auth.legalPrivacy": "Política de privacidad",

  // ── Errors ────────────────────────────────────────────────────────────
  "auth.error.blackbaudCancelled": "Se canceló el inicio de sesión con Blackbaud.",
  "auth.error.veracrossCancelled": "Se canceló el inicio de sesión con Veracross.",
  "auth.error.expired": "Su enlace de inicio de sesión venció. Inténtelo de nuevo.",
  "auth.error.blackbaudFailed": "No pudimos iniciar su sesión con Blackbaud. Inténtelo de nuevo.",
  "auth.error.veracrossFailed": "No pudimos iniciar su sesión con Veracross. Inténtelo de nuevo.",
  "auth.error.wrongEnvironment":
    "Esa cuenta de Blackbaud pertenece a otra escuela. Asegúrese de elegir la escuela correcta.",
  "auth.error.blackbaudNotParent":
    "Aquí solo pueden iniciar sesión padres y tutores, y su cuenta de Blackbaud no figura como tal. Si cree que es un error, comuníquese con la oficina de su escuela.",
  "auth.error.veracrossNotParent":
    "Aquí solo pueden iniciar sesión padres y tutores, y su cuenta de Veracross no figura como tal. Si cree que es un error, comuníquese con la oficina de su escuela.",
  "auth.error.veracrossNoEmail":
    "Su cuenta de Veracross no tiene un correo electrónico registrado. Pida a la oficina de su escuela que agregue uno y vuelva a intentarlo.",
  "auth.error.veracrossMismatch":
    "Este correo electrónico ya está vinculado a otra cuenta de Veracross. Comuníquese con la oficina de su escuela.",
  "auth.error.staffAccount":
    "Esta es una cuenta del personal. Use el inicio de sesión del personal escolar.",
  "auth.error.schoolNotFound": "No pudimos encontrar esa escuela.",
  "auth.error.temporarilyUnavailable":
    "El inicio de sesión no está disponible temporalmente. Inténtelo de nuevo más tarde.",
  "auth.error.handoffFailed": "No pudimos terminar de iniciar su sesión. Inténtelo de nuevo.",
  "auth.error.rosterGate":
    "Su correo electrónico aún no figura en la lista de padres de {school} para AskMySchool. Comuníquese con la oficina de la escuela.",
  "auth.error.googleNoAccount":
    "Ninguna cuenta de AskMySchool usa este correo de Google. Padres: elijan su escuela e inicien sesión con Blackbaud o Veracross, según la que use su escuela. Personal escolar: pida al administrador de su escuela que lo agregue.",
  "auth.error.googleNotThisSchool":
    "Su cuenta de Google no tiene acceso a esta escuela. Padres: inicien sesión con su cuenta escolar en esta página. Personal escolar: pida al administrador de esta escuela que lo agregue.",
  "auth.error.googleUnverified":
    "Google no ha verificado este correo electrónico, así que no se puede usar para iniciar sesión. Elija otra forma de iniciar sesión.",
  "auth.error.googleFailed": "No pudimos iniciar su sesión con Google. Inténtelo de nuevo.",
  "auth.error.googleDisabled":
    "El inicio de sesión con Google no está disponible en este momento. Inicie sesión con su contraseña.",
  "auth.error.passwordDisabled": "Esta cuenta inicia sesión con Google.",
  "auth.error.adminGoogleOnly":
    "Por seguridad, el acceso de administrador requiere iniciar sesión con Google. Use Continuar con Google.",
  "auth.error.parentPassword":
    "Los padres inician sesión con su cuenta escolar. Elija su escuela y use “Iniciar sesión con Blackbaud” o “Iniciar sesión con Veracross”, según la que use su escuela.",
  "auth.error.noAccess": "No tiene acceso a esta escuela.",
  "auth.error.notStaff": "Usted no forma parte del personal de esta escuela.",
  "auth.error.loginFailed": "No se pudo iniciar sesión.",
  "auth.error.invalidCredentials": "Correo electrónico o contraseña incorrectos.",
  "auth.error.emailNotConfirmed": "El correo electrónico no está confirmado.",
  "auth.error.nameRequired": "El nombre es obligatorio.",
  "auth.error.invalidGrade": "Grado no válido.",
  "auth.error.invalidDetails": "Los datos no son válidos.",
  "auth.error.notSignedIn": "No ha iniciado sesión.",
  "auth.error.noSchoolAccess": "No tiene acceso a esta escuela.",
  "auth.error.saveChildrenFailed": "No pudimos guardar a sus hijos. Inténtelo de nuevo.",
  "auth.error.finishSetupFailed": "No pudimos terminar de configurar su cuenta.",

  // ── Welcome (add your children) ───────────────────────────────────────
  "auth.welcome.eyebrow": "Bienvenida",
  "auth.welcome.eyebrowReturning": "Un paso más",
  "auth.welcome.addChildren": "Agregue a sus hijos",
  "auth.welcome.inAt": "Ya tiene acceso a {school}",
  "auth.welcome.in": "Ya tiene acceso",
  "auth.welcome.matched":
    "Lo encontramos en los registros de {possessive} como {name}. Si no es usted, comuníquese con la oficina de la escuela antes de continuar.",
  "auth.welcome.intro":
    "Díganos quiénes son sus hijos para adaptar las respuestas a su grado. Puede cambiarlo más tarde en su perfil.",
  "auth.welcome.gradeNote":
    "Indique el grado de este año; se actualiza automáticamente cada año escolar.",
  "auth.welcome.childName": "Nombre de su hijo(a)",
  "auth.welcome.childNumber": "Hijo(a) {number}",
  "auth.welcome.namePlaceholder": "Nombre y apellido",
  "auth.welcome.gradeLevel": "Grado",
  "auth.welcome.selectGrade": "Seleccione",
  "auth.welcome.removeChild": "Quitar hijo(a) {number}",
  "auth.welcome.addAnother": "Agregar otro hijo(a)",
  "auth.welcome.atLeastOne": "Agregue al menos un hijo(a) para continuar.",
  "auth.welcome.skip": "Omitir por ahora",

  "auth.grade.preK": "Prekínder",
  "auth.grade.k": "Kínder",
  "auth.grade.1": "1.er grado",
  "auth.grade.2": "2.º grado",
  "auth.grade.3": "3.er grado",
  "auth.grade.4": "4.º grado",
  "auth.grade.5": "5.º grado",
  "auth.grade.6": "6.º grado",
  "auth.grade.7": "7.º grado",
  "auth.grade.8": "8.º grado",
  "auth.grade.9": "9.º grado",
  "auth.grade.10": "10.º grado",
  "auth.grade.11": "11.º grado",
  "auth.grade.12": "12.º grado",

  // ── Pending approval ──────────────────────────────────────────────────
  "auth.pending.eyebrow": "Ya casi",
  "auth.pending.title": "Aprobación pendiente",
  "auth.pending.body":
    "Su solicitud para unirse a {school} está pendiente de revisión. Un administrador de la escuela aprobará su acceso.",
  "auth.pending.otherSchools": "Sus otras escuelas:",
  "auth.pending.approved": "Aprobado. Ingresando…",
  "auth.pending.checking":
    "Verificando automáticamente: esta página se actualizará cuando se apruebe su acceso.",
};
