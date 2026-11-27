import type { chat as en } from "../en/chat";

export const chat: Record<keyof typeof en, string> = {
  // Chat column
  "chat.conversation": "Conversación",
  "chat.newChat": "Nueva conversación",
  "chat.inputPlaceholder": "Haga una pregunta sobre su escuela…",
  "chat.send": "Enviar",
  "chat.sending": "Enviando…",
  "chat.searchingDocuments": "Buscando en los documentos…",
  "chat.consentNotice":
    "Para recibir respuestas, acepte el procesamiento con IA: envíe su pregunta de nuevo para ver el aviso.",
  "chat.errorUnavailable":
    "Ask My School no está disponible en este momento. Inténtelo de nuevo en un rato.",
  "chat.previewSearching": "Buscando documentos que coincidan con «{query}»…",
  "chat.previewNone": "No se encontraron documentos que coincidan con «{query}».",
  "chat.previewFound": "Se encontraron {count} documento(s) que coinciden con «{query}»:",

  // Empty state
  "chat.welcomeHeading": "Pregunte sobre su escuela",
  "chat.welcomeText": "Obtenga respuestas al instante de los documentos oficiales de la escuela.",
  "chat.defaultQuestion1": "¿Cuál es el horario escolar?",
  "chat.defaultQuestion2": "¿Cuál es el código de vestimenta?",
  "chat.defaultQuestion3": "¿Cómo me comunico con el maestro de mi hijo?",
  "chat.defaultQuestion4": "¿Qué opciones de almuerzo hay?",
  "chat.defaultQuestion5": "¿Cuándo es la próxima reunión de padres y maestros?",
  "chat.defaultQuestion6": "¿Cuál es la política de asistencia?",

  // An answer
  "chat.searchWeb": "Buscar en la web",
  "chat.whoToContact": "A quién contactar",
  "chat.helpful": "Útil",
  "chat.notHelpful": "No útil",
  "chat.notHelpfulTitle":
    "No útil: permite que su escuela vea esta pregunta y respuesta para poder mejorar",
  "chat.shareAnswer": "Compartir respuesta",
  "chat.shareTitle": "Respuesta de AskMySchool",
  "chat.answerCopied": "Respuesta copiada",
  "chat.shareFailed": "No se pudo compartir esta respuesta",
  "chat.shareSourcesHeading": "Fuentes:",
  "chat.shareFrom": "De AskMySchool",

  // Sources
  "chat.sources": "Fuentes",
  "chat.source": "Fuente",
  "chat.sourceNumber": "Fuente {n}",
  "chat.citationLabel": "Fuente {n}: {title}",
  "chat.calendarEvent": "Evento del calendario",
  "chat.addToCalendar": "Agregar {title} al calendario",
  "chat.openPassage": "Abrir {title}",
  "chat.openPassageAt": "Abrir {title} en {label}",
  "chat.openWebPage": "Abrir la página web",
  "chat.openFullscreen": "Abrir en pantalla completa",
  "chat.download": "Descargar",
  "chat.sourceSheetDescription": "El documento de la escuela que cita esta respuesta.",
  "chat.renderFailed": "No se pudo mostrar la vista previa del documento.",
  "chat.announcement": "Anuncio",
  "chat.event": "Evento",
  "chat.clarification": "Aclaración",
  "chat.openViewer": "Abrir visor",
  "chat.openInSidebar": "Abrir en panel lateral",
  "chat.visitPage": "Visitar página",

  // Export
  "chat.exportChat": "Exportar conversación",
  "chat.exportText": "Descargar como texto",
  "chat.exportPrint": "Imprimir / Guardar como PDF",
  "chat.exportDefaultTitle": "Conversación exportada",
  "chat.exportYou": "Usted",
  "chat.exportAssistant": "Asistente",

  // AI consent dialog
  "chat.consentTitle": "Antes de preguntar: cómo se generan las respuestas",
  "chat.consentDescription": "AskMySchool usa IA para responder sus preguntas.",
  "chat.consentBullet1":
    "Cuando hace una pregunta, <b>su pregunta</b> y <b>los fragmentos pertinentes de los documentos de su escuela</b> se envían a <b>Gemini, la IA de Google</b>, para redactar la respuesta. Es posible que se incluya el grado de sus hijos para que las respuestas correspondan a su división, pero antes se eliminan sus nombres.",
  "chat.consentBullet2":
    "<b>Las respuestas de la IA pueden contener errores.</b> Consulte los documentos de la escuela enlazados para todo lo importante y comuníquese con la escuela si algo no le parece correcto.",
  "chat.consentBullet3":
    "Sus datos no se usan para entrenar nuestros modelos. Usamos la API de pago de Gemini de Google, según la cual Google tampoco los usa para entrenar sus modelos.",
  "chat.consentBullet4": "Puede retirar este consentimiento en cualquier momento desde su Perfil.",
  "chat.consentTerms":
    "La política de privacidad y los términos que se muestran al iniciar sesión con Blackbaud (u otro servicio de inicio de sesión de su escuela) se aplican solo a esa cuenta. Su uso de AskMySchool se rige por los propios <terms>Términos de servicio</terms> y <privacy>Política de privacidad</privacy> de AskMySchool.",
  "chat.notNow": "Ahora no",
  "chat.saving": "Guardando…",
  "chat.agree": "Acepto",

  // Chat history
  "chat.chats": "Conversaciones",
  "chat.showChats": "Mostrar conversaciones",
  "chat.hideChats": "Ocultar conversaciones",
  "chat.historyEmpty":
    "Sus conversaciones aparecerán aquí. Se guardan durante 30 días después de su último mensaje.",
  "chat.groupToday": "Hoy",
  "chat.groupYesterday": "Ayer",
  "chat.groupPrevious7Days": "Últimos 7 días",
  "chat.groupOlder": "Anteriores",
  "chat.chatName": "Nombre de la conversación",
  "chat.saveName": "Guardar nombre",
  "chat.cancelRename": "Cancelar cambio de nombre",
  "chat.rename": "Cambiar nombre",
  "chat.renameChat": "Cambiar nombre de “{title}”",
  "chat.delete": "Eliminar",
  "chat.deleteChat": "Eliminar “{title}”",
  "chat.deleteConfirmTitle": "¿Eliminar conversación?",
  "chat.deleteConfirmBody":
    "“{title}” se eliminará de sus conversaciones. Esta acción no se puede deshacer.",
  "chat.cancel": "Cancelar",
  "chat.deleting": "Eliminando…",
  "chat.loadFailed": "No se pudo cargar esta conversación. {error}",
  "chat.tryAgain": "Reintentar",
  "chat.pleaseTryAgain": "Inténtelo de nuevo.",
  "chat.renameFailed": "No se pudo cambiar el nombre de la conversación. Inténtelo de nuevo.",
  "chat.deleteFailed": "No se pudo eliminar la conversación. Inténtelo de nuevo.",
};
