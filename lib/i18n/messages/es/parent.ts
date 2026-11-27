import type { parent as en } from "../en/parent";

export const parent: Record<keyof typeof en, string> = {
  // Acciones comunes
  "parent.action.cancel": "Cancelar",
  "parent.action.save": "Guardar",

  // Barra lateral / menú móvil
  "parent.nav.chat": "Chat",
  "parent.nav.documents": "Documentos",
  "parent.nav.contacts": "Contactos",
  "parent.nav.calendar": "Calendario",
  "parent.nav.profile": "Perfil",
  "parent.nav.chats": "Chats",
  "parent.nav.joinSchool": "Unirse a una escuela",
  "parent.nav.account": "Cuenta",
  "parent.nav.signOut": "Cerrar sesión",
  "parent.mobile.openMenu": "Abrir menú",
  "parent.mobile.navigation": "Navegación",

  // Notificaciones
  "parent.notifications.title": "Notificaciones",
  "parent.notifications.markAllRead": "Marcar todo como leído",
  "parent.notifications.loading": "Cargando",
  "parent.notifications.empty": "Aún no hay notificaciones",

  // Aviso "Agregue a sus hijos"
  "parent.addChildren.title": "Agregue a sus hijos",
  "parent.addChildren.description":
    "Díganos quiénes son sus hijos para adaptar las respuestas a su grado. También puede hacerlo en cualquier momento desde Perfil.",
  "parent.addChildren.skip": "Omitir por ahora",
  "parent.addChildren.add": "Agregar hijos",

  // Página de error
  "parent.error.title": "Algo salió mal",
  "parent.error.body": "Ocurrió un error inesperado. Inténtelo de nuevo.",
  "parent.error.retry": "Intentar de nuevo",

  // Instalar la app
  "parent.install.label": "Instalar app",
  "parent.install.safariTipBefore": "En Safari, elija ",
  "parent.install.safariTipMenu": "Archivo > Añadir al Dock",
  "parent.install.safariTipAfter": ".",

  // Unirse a una escuela
  "parent.joinSchool.title": "Agregar una escuela",
  "parent.joinSchool.description": "Elija la escuela e inicie sesión con su cuenta de Blackbaud.",
  "parent.joinSchool.allJoinedBefore":
    "Ya está en todas las escuelas de AskMySchool. Si su escuela no aparece, pregunte en la oficina de la escuela o ",
  "parent.joinSchool.contactUs": "contáctenos",
  "parent.joinSchool.allJoinedAfter": ".",
  "parent.joinSchool.pending": "Esperando aprobación: {schools}",

  // Cambiar de escuela
  "parent.schoolSwitcher.otherSchool": "Otra escuela",
  "parent.schoolSwitcher.switchTo": "Cambiar a {school}",
  "parent.schoolSwitcher.switching": "Cambiando…",
  "parent.schoolSwitcher.switchSchool": "Cambiar de escuela",
  "parent.schoolSwitcher.unknownSchool": "Escuela desconocida",
  "parent.schoolSwitcher.role.admin": "administrador",
  "parent.schoolSwitcher.role.parent": "padre/madre",

  // Perfil
  "parent.profile.title": "Perfil",
  "parent.profile.subtitle": "Administre sus datos y los de sus hijos.",
  "parent.profile.personalInfo": "Información personal",
  "parent.profile.personalInfoHint": "Administre los datos de su cuenta.",
  "parent.profile.fullName": "Nombre completo",
  "parent.profile.namePlaceholder": "Su nombre",
  "parent.profile.email": "Correo electrónico",
  "parent.profile.joined": "Se unió el {date}",
  "parent.profile.nameUpdated": "Nombre actualizado",
  "parent.profile.language": "Idioma",
  "parent.profile.languageHint": "El idioma en que Ask My School le muestra todo.",
  "parent.profile.languageRow": "Language / Idioma",
  "parent.profile.children": "Hijos",
  "parent.profile.childrenHint":
    "Administre la información de sus hijos. El grado avanza automáticamente cada año escolar el {date}.",
  "parent.profile.addChild": "Agregar hijo",
  "parent.profile.editChild": "Editar hijo",
  "parent.profile.noChildren": "Aún no ha agregado hijos. Toque “Agregar hijo” para comenzar.",
  "parent.profile.graduated": "Graduado",
  "parent.profile.classOf": "Promoción {year}",
  "parent.profile.childUpdated": "Datos del hijo actualizados",
  "parent.profile.childAdded": "Hijo agregado",
  "parent.profile.childRemoved": "Hijo eliminado",
  "parent.profile.childName": "Nombre",
  "parent.profile.childNamePlaceholder": "Nombre de su hijo",
  "parent.profile.gradeLevel": "Grado",
  "parent.profile.selectGrade": "Seleccione el grado",
  "parent.profile.gradeHint":
    "El grado en que está inscrito su hijo, no su edad. Avanza solo cada año escolar; cámbielo aquí si no es correcto.",
  "parent.profile.add": "Agregar",
  "parent.profile.removeChildTitle": "Eliminar hijo",
  "parent.profile.removeChildDescription":
    "¿Está seguro de que desea eliminar a este hijo? Esta acción no se puede deshacer.",
  "parent.profile.remove": "Eliminar",

  // Grados (solo para mostrar; los valores guardados no cambian)
  "parent.grade.Pre-K": "Pre-kínder",
  "parent.grade.K": "Kínder",
  "parent.grade.1": "1.er grado",
  "parent.grade.2": "2.º grado",
  "parent.grade.3": "3.er grado",
  "parent.grade.4": "4.º grado",
  "parent.grade.5": "5.º grado",
  "parent.grade.6": "6.º grado",
  "parent.grade.7": "7.º grado",
  "parent.grade.8": "8.º grado",
  "parent.grade.9": "9.º grado",
  "parent.grade.10": "10.º grado",
  "parent.grade.11": "11.º grado",
  "parent.grade.12": "12.º grado",

  // Perfil: notificaciones
  "parent.notificationSettings.title": "Notificaciones",
  "parent.notificationSettings.description":
    "Las notificaciones llegan a la app AskMySchool para iPhone y Android.",
  "parent.notificationSettings.newDocuments": "Documentos nuevos",
  "parent.notificationSettings.newDocumentsHint":
    "Reciba una notificación cuando {school} agregue documentos nuevos.",
  "parent.notificationSettings.yourSchool": "su escuela",

  // Perfil: consentimiento de IA
  "parent.ai.title": "Procesamiento con IA",
  "parent.ai.subtitle": "Cómo se responden sus preguntas.",
  "parent.ai.notice":
    "Para responder una pregunta, AskMySchool la envía, junto con los fragmentos pertinentes de los documentos de su escuela, a Gemini, la IA de Google. Sus hijos se describen por su grado, no por su nombre. Las respuestas de la IA pueden tener errores, así que revise los documentos enlazados para todo lo importante. Consulte nuestra ",
  "parent.ai.privacyPolicy": "Política de privacidad",
  "parent.ai.noticeEnd": ".",
  "parent.ai.on": "Activado",
  "parent.ai.agreed": "aceptado el {date}",
  "parent.ai.off": "Desactivado",
  "parent.ai.offHint": "se le pedirá su consentimiento antes de su próxima pregunta",
  "parent.ai.withdraw": "Retirar consentimiento",
  "parent.ai.agree": "Aceptar",
  "parent.ai.supportQuestion": "¿Preguntas sobre su cuenta?",
  "parent.ai.getSupport": "Obtener ayuda",
  "parent.ai.confirmTitle": "¿Retirar su consentimiento al procesamiento con IA?",
  "parent.ai.confirmDescription":
    "No podrá hacer preguntas hasta que vuelva a aceptar. Sus conversaciones anteriores se conservan en su historial.",
  "parent.ai.confirmWithdraw": "Retirar",
  "parent.ai.turnedOff": "Procesamiento con IA desactivado",
  "parent.ai.turnedOn": "Procesamiento con IA activado",

  // Perfil: eliminar cuenta
  "parent.deleteAccount.title": "Eliminar cuenta",
  "parent.deleteAccount.subtitle":
    "Elimine de forma permanente su cuenta de AskMySchool y todo lo que contiene.",
  "parent.deleteAccount.summary":
    "Se eliminan sus chats, comentarios, hijos y configuración de notificaciones. Su cuenta de Blackbaud no se ve afectada.",
  "parent.deleteAccount.button": "Eliminar mi cuenta",
  "parent.deleteAccount.confirmTitle": "¿Eliminar su cuenta?",
  "parent.deleteAccount.confirmDescription":
    "Esto elimina de forma permanente su cuenta, su historial de chat, sus comentarios, sus hijos y sus dispositivos de notificaciones push en todas las escuelas a las que pertenece. No se puede deshacer. Si más adelante vuelve a iniciar sesión con Blackbaud, comenzará con una cuenta nueva y vacía.",
  "parent.deleteAccount.typeBefore": "Escriba ",
  "parent.deleteAccount.typeAfter": " para confirmar",

  // Documentos
  "parent.documents.title": "Documentos",
  "parent.documents.subtitle": "Consulte los documentos y recursos de la escuela.",
  "parent.documents.searchTitle": "Buscar por título…",
  "parent.documents.searchContent": "Buscar en el contenido…",
  "parent.documents.switchToContent": "Cambiar a buscar en el contenido de los documentos",
  "parent.documents.switchToTitle": "Cambiar a buscar por título",
  "parent.documents.modeContent": "Contenido",
  "parent.documents.modeTitle": "Título",
  "parent.documents.category": "Categoría",
  "parent.documents.allCategories": "Todas las categorías",
  "parent.documents.clear": "Borrar",
  "parent.documents.searching": "Buscando en el contenido…",
  "parent.documents.contentMatchOne": "{count} coincidencia en el contenido",
  "parent.documents.contentMatchOther": "{count} coincidencias en el contenido",
  "parent.documents.section": "Sección {number}",
  "parent.documents.noContentMatches": "No se encontraron coincidencias en el contenido.",
  "parent.documents.empty": "No se encontraron documentos",
  "parent.documents.emptyFiltered": "Pruebe a cambiar la búsqueda o los filtros.",
  "parent.documents.emptyNone": "Vuelva más tarde para ver los documentos de la escuela.",
  "parent.documents.general": "General",

  // Contactos
  "parent.contacts.title": "Contactos",
  "parent.contacts.subtitle": "Encuentre a la persona u oficina indicada en la escuela.",
  "parent.contacts.searchPlaceholder": "Buscar por nombre, cargo, departamento o tema…",
  "parent.contacts.searchLabel": "Buscar contactos",
  "parent.contacts.clearSearch": "Borrar búsqueda",
  "parent.contacts.departments": "Departamentos",
  "parent.contacts.all": "Todos",
  "parent.contacts.countOne": "{count} contacto",
  "parent.contacts.countOther": "{count} contactos",
  "parent.contacts.empty": "No se encontraron contactos",
  "parent.contacts.emptyFiltered": "Pruebe con otra búsqueda.",
  "parent.contacts.emptyNone": "Su escuela aún no ha agregado su directorio del personal.",
  "parent.contacts.other": "Otros",
  "parent.contacts.topic.transportation": "Transporte",
  "parent.contacts.topic.health": "Salud y enfermería",
  "parent.contacts.topic.tuition_billing": "Colegiatura y pagos",
  "parent.contacts.topic.schedules_calendar": "Horarios y calendario",
  "parent.contacts.topic.athletics": "Deportes",
  "parent.contacts.topic.admissions": "Admisiones",
  "parent.contacts.topic.academics": "Asuntos académicos",
  "parent.contacts.topic.technology": "Tecnología",
  "parent.contacts.topic.after_school": "Después de clases",
  "parent.contacts.topic.parents_association": "Asociación de padres",
  "parent.contacts.topic.main_office": "Oficina principal / general",

  // Calendario
  "parent.calendar.addToCalendar": "Agregar al calendario",
  "parent.calendar.addEventToCalendar": "Agregar {title} al calendario",
  "parent.calendar.edit": "Editar",
  "parent.calendar.delete": "Eliminar",
  "parent.calendar.editEvent": "Editar evento",
  "parent.calendar.deleteEvent": "Eliminar evento",
  "parent.calendar.eventCountSrOne": ", {count} evento",
  "parent.calendar.eventCountSrOther": ", {count} eventos",
  "parent.calendar.more": "+{count} más",
  "parent.calendar.allDay": "todo el día",
  "parent.calendar.createEvent": "Crear evento",
  "parent.calendar.createEventPlus": "+ Crear evento",
  "parent.calendar.viewLabel": "Vista del calendario",
  "parent.calendar.view.month": "mes",
  "parent.calendar.view.week": "semana",
  "parent.calendar.view.day": "día",
  "parent.calendar.today": "Hoy",
  "parent.calendar.previous": "Anterior",
  "parent.calendar.next": "Siguiente",
  "parent.calendar.labels": "Etiquetas",
  "parent.calendar.noLabel": "Sin etiqueta",
  "parent.calendar.dayCountOne": "— {count} evento",
  "parent.calendar.dayCountOther": "— {count} eventos",
  "parent.calendar.noEvents": "No hay eventos este día",

  // Menú Agregar al calendario
  "parent.addToCalendar.appleError": "No se pudo abrir Apple Calendar. Inténtelo de nuevo.",
  "parent.addToCalendar.applePreparing": "Apple Calendar…",
  "parent.addToCalendar.appleUnavailable": "Apple Calendar no disponible",
  "parent.addToCalendar.icsFile": "Archivo de calendario (.ics)",

  // Visor de documentos
  "parent.viewer.download": "Descargar",
  "parent.viewer.renderFailed": "No se pudo mostrar la vista previa del documento.",
  "parent.source.noText": "Este documento no tiene texto para mostrar.",
  "parent.source.unknownSender": "Remitente desconocido",
  "parent.source.to": "Para: {value}",
  "parent.source.cc": "CC: {value}",
  "parent.source.from": "De: {value}",
  "parent.source.subject": "Asunto: {value}",
  "parent.source.noEmailText": "Este correo no tiene texto.",
  "parent.source.hideQuoted": "Ocultar texto citado",
  "parent.source.showQuoted": "Mostrar texto citado",
  "parent.source.forwarded": "Mensaje reenviado",
  "parent.source.viewOriginal": "Ver página original",
  "parent.source.emailFrame": "Mensaje de correo",
};
