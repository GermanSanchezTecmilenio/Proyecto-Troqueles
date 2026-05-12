import { api, clearToken, formData, getToken, setToken } from "./api.js?v=20260507-icons";

const loginView = document.querySelector("#login-view");
const appView = document.querySelector("#app-view");
const root = document.querySelector("#view-root");
const title = document.querySelector("#view-title");
const eyebrow = document.querySelector("#view-eyebrow");
const actions = document.querySelector("#view-actions");
const nav = document.querySelector("#main-nav");
const navToggle = document.querySelector("#nav-toggle");
const menuHomeButton = document.querySelector("#menu-home-button");
const currentUser = document.querySelector("#current-user");

const GODMISA_INTERNAL_PIEZA_ID = 2460;
const GODMISA_INTERNAL_DESTINO = "GODMISA (ALMACEN, INGENIERIA O TALLER)";
const MEDIDAS_REQUISICION = ["PIEZAS", "CAJAS", "PAQUETES", "KILOS", "GRAMOS", "METROS", "CMS", "PULGADAS", "LIBRAS", "PIES", "BLISTER"];
const DASHBOARD_CHART_COLORS = ["#0f77b8", "#21a67a", "#e3b505", "#b42318", "#6f7d95", "#5aa9e6"];
const MONITOR_SHORTCUTS = [
  { key: "F2", label: "Ampliar imagen", action: "image" },
  { key: "F4", label: "Estimacion", action: "estimate" },
  { key: "F5", label: "Cambiar estatus", action: "status" },
  { key: "F6", label: "Nota", action: "note" },
  { key: "F7", label: "Entrega parcial", action: "partial" },
  { key: "F12", label: "Consultar PDF", action: "pdf" }
];
const REPORT_OPTIONS = [
  { id: "diarioOperador", label: "Reporte diario por operador", detail: "Tiempos capturados por operador y fecha" },
  { id: "busquedaPiezas", label: "Busqueda de piezas", detail: "Consulta general por cliente, OC, parte o descripcion" },
  { id: "piezasFechas", label: "Reporte de piezas por fechas", detail: "Piezas ordenadas por requerimiento y compromiso" },
  { id: "piezasVencer", label: "Reporte de piezas por vencer", detail: "Piezas pendientes con compromiso proximo o vencido" },
  { id: "tiemposOperador", label: "Reporte de tiempos por operador", detail: "Minutos acumulados y piezas trabajadas" },
  { id: "piezasEntregadas", label: "Reporte de piezas entregadas", detail: "Piezas y remisiones con avance de entrega" },
  { id: "estimacionSemanal", label: "Estimacion Semanal", detail: "Carga pendiente para los siguientes siete dias" },
  { id: "embarques", label: "Embarques", detail: "Remisiones generadas y salidas a cliente" },
  { id: "estadisticas", label: "Estadisticas", detail: "Indicadores por estatus, cliente y documentos" },
  { id: "impresionFactura", label: "Impresion de Factura", detail: "Entregas listas para facturacion" },
  { id: "facturasGeneradas", label: "Facturas Generadas", detail: "Control de facturas registradas" }
];
const OFFICIAL_ACTIVITIES = [
  {
    name: "Troquelado compuesto",
    category: "Troquelado",
    provider: "God Maquinados, S.A. de C.V. Godmisa",
    coverage: "Nacional",
    description: "Fabricacion de piezas metalicas, troqueles restaurados y fixtures de inspeccion o ensamble.",
    source: "https://www.cosmos.com.mx/producto/troquelado-bntc/troquelado-compuesto-gsj1i444b.html"
  }
];

let cache = { clientes: [], proveedores: [], estatus: [], operadores: [], piezas: [], articulos: [] };
let currentViewName = "dashboard";
let lastOrdenTrabajoPreviewId = null;
let selectedMonitorPiezaId = null;
let lastMonitorRows = [];
let pendingRemisionPiezaId = null;
let requisicionMaterialOptions = [];
let requisicionPartidas = [];
let selectedRequisicionPartidaIndex = null;
let selectedReportId = "diarioOperador";
const MENU_ICON_BASE = "/assets/menu-icons/";

const moduleCards = {
  dashboard: { label: "Dashboard", detail: "KPIs y estatus operativo", icon: "DB", image: "dashboard.svg", tone: "blue" },
  catalogosMenu: { label: "Catalogos", detail: "Clientes, proveedores y operadores", icon: "CG", image: "catalogos.svg", tone: "teal" },
  produccionMenu: { label: "Produccion", detail: "Actividades, piezas y OT", icon: "PR", image: "produccion.svg", tone: "green" },
  comprasMenu: { label: "Compras", detail: "Requisiciones y OC", icon: "CP", image: "compras.svg", tone: "orange" },
  clientes: { label: "Clientes", detail: "Datos fiscales y contactos", icon: "CL", image: "clientes.svg", tone: "teal", parent: "catalogosMenu" },
  proveedores: { label: "Proveedores", detail: "Pagos, RFC y retenciones", icon: "PV", image: "proveedores.svg", tone: "sky", parent: "catalogosMenu" },
  operadores: { label: "Operadores", detail: "Personal de taller y choferes", icon: "OP", image: "operadores.svg", tone: "amber", parent: "catalogosMenu" },
  actividades: { label: "Actividades", detail: "Operaciones oficiales GODMISA", icon: "AC", image: "actividades.svg", tone: "blue", parent: "produccionMenu" },
  piezas: { label: "Piezas", detail: "Alta y detalle de piezas", icon: "PZ", image: "piezas.svg", tone: "indigo", parent: "produccionMenu" },
  ordenes: { label: "Ordenes de trabajo", detail: "Agrupar piezas por OT", icon: "OT", image: "ordenes.svg", tone: "steel", parent: "produccionMenu" },
  monitor: { label: "Monitor de produccion", detail: "Estatus, notas y seguimiento", icon: "MN", image: "monitor.svg", tone: "green", parent: "produccionMenu" },
  tiempos: { label: "Tiempos", detail: "Captura por operador", icon: "TP", image: "tiempos.svg", tone: "violet", parent: "produccionMenu" },
  requisiciones: { label: "Requisiciones", detail: "Solicitud de material", icon: "RQ", image: "requisiciones.svg", tone: "orange", parent: "comprasMenu" },
  ordenesCompra: { label: "Ordenes de compra", detail: "OC, IVA y retenciones", icon: "OC", image: "ordenes-compra.svg", tone: "red", parent: "comprasMenu" },
  almacen: { label: "Almacen", detail: "Inventario y reorden", icon: "AL", image: "almacen.svg", tone: "amber" },
  remisiones: { label: "Remisiones", detail: "Salidas y entregas", icon: "RM", image: "remisiones.svg", tone: "cyan" },
  reportes: { label: "Reportes", detail: "Analisis y exportacion", icon: "RP", image: "reportes.svg", tone: "sky" }
};

const menuSections = [
  {
    id: "catalogosMenu",
    title: "Catalogos",
    navLabel: "Catalogos",
    items: ["clientes", "proveedores", "operadores"]
  },
  {
    id: "produccionMenu",
    title: "Produccion",
    navLabel: "Produccion",
    items: ["actividades", "piezas", "ordenes", "monitor", "tiempos"]
  },
  {
    id: "comprasMenu",
    title: "Compras",
    navLabel: "Compras",
    items: ["requisiciones", "ordenesCompra"]
  }
];

const mainMenuItems = ["dashboard", "catalogosMenu", "produccionMenu", "comprasMenu", "almacen", "remisiones", "reportes"];

const menuViews = Object.fromEntries(menuSections.map(section => [
  section.id,
  {
    title: section.title,
    eyebrow: section.navLabel,
    exportable: false,
    render: () => renderMenuSection(section.id)
  }
]));

const views = {
  ...menuViews,
  menuGeneral: { title: "Menu principal", eyebrow: "Aplicaciones", exportable: false, render: renderMenuGeneral },
  dashboard: { title: "Dashboard operativo", render: renderDashboard },
  altas: { title: "Altas", render: renderAltas },
  clientes: { title: "Clientes", render: renderClientes },
  proveedores: { title: "Proveedores", render: renderProveedores },
  piezas: { title: "Piezas", render: renderPiezas },
  actividades: { title: "Actividades de produccion", render: renderActividades },
  ordenes: { title: "Ordenes de trabajo", render: renderOrdenes },
  monitor: { title: "Monitor de produccion", render: renderMonitor },
  operadores: { title: "Operadores", render: renderOperadores },
  tiempos: { title: "Captura de tiempos", render: renderTiempos },
  requisiciones: { title: "Requisiciones", render: renderRequisiciones },
  ordenesCompra: { title: "Ordenes de compra", render: renderOrdenesCompra },
  almacen: { title: "Almacen basico", render: renderAlmacen },
  remisiones: { title: "Remisiones", render: renderRemisiones },
  reportes: { title: "Reportes", render: renderReportes }
};

const importConfigs = {
  altas: { alias: "piezas" },
  clientes: {
    label: "clientes",
    endpoint: "/api/clientes",
    map: row => ({
      nombreCliente: textFromCsv(row, ["nombreCliente", "nombre", "cliente"]),
      razonSocial: textFromCsv(row, ["razonSocial", "razon social"]),
      rfc: textFromCsv(row, ["rfc"]),
      calle: textFromCsv(row, ["calle"]),
      colonia: textFromCsv(row, ["colonia"]),
      municipio: textFromCsv(row, ["municipio"]),
      estado: textFromCsv(row, ["estado"]),
      cp: textFromCsv(row, ["cp", "codigo postal"]),
      formatoFactura: boolFromCsv(row, ["formatoFactura", "formato factura"], true),
      activo: boolFromCsv(row, ["activo"], true)
    })
  },
  proveedores: {
    label: "proveedores",
    endpoint: "/api/proveedores",
    map: row => ({
      nombreProveedor: textFromCsv(row, ["nombreProveedor", "proveedor", "nombre"]),
      razonSocial: textFromCsv(row, ["razonSocial", "razon social"]),
      representanteLegal: textFromCsv(row, ["representanteLegal", "representante legal"]),
      direccionFiscal: textFromCsv(row, ["direccionFiscal", "direccion fiscal", "direccion"]),
      ciudad: textFromCsv(row, ["ciudad"]),
      rfc: textFromCsv(row, ["rfc"]),
      calle: textFromCsv(row, ["calle"]),
      colonia: textFromCsv(row, ["colonia"]),
      municipio: textFromCsv(row, ["municipio"]),
      estado: textFromCsv(row, ["estado"]),
      cp: textFromCsv(row, ["cp", "codigo postal"]),
      telefono: textFromCsv(row, ["telefono", "tel"]),
      fax: textFromCsv(row, ["fax"]),
      contacto: textFromCsv(row, ["contacto"]),
      correo: textFromCsv(row, ["correo", "email"]),
      condicionesPago: textFromCsv(row, ["condicionesPago", "condiciones pago", "pago"], "Credito 30 dias"),
      banco: textFromCsv(row, ["banco"]),
      clabe: textFromCsv(row, ["clabe"]),
      numeroCuenta: textFromCsv(row, ["numeroCuenta", "numero cuenta", "no cuenta", "cuenta"]),
      retencionIvaPct: numberFromCsv(row, ["retencionIvaPct", "ret iva", "retencion iva"], 0),
      retencionIsrPct: numberFromCsv(row, ["retencionIsrPct", "ret isr", "retencion isr"], 0),
      activo: boolFromCsv(row, ["activo"], true)
    })
  },
  operadores: {
    label: "operadores",
    endpoint: "/api/operadores",
    map: row => ({
      nombreOperador: textFromCsv(row, ["nombreOperador", "operador", "nombre"]),
      turno: numberFromCsv(row, ["turno"], 1),
      supervisor: boolFromCsv(row, ["supervisor"], false),
      chofer: boolFromCsv(row, ["chofer"], false),
      activo: boolFromCsv(row, ["activo"], true)
    })
  },
  piezas: {
    label: "piezas",
    endpoint: "/api/piezas",
    map: row => ({
      clienteId: resolveReferenceId(row, ["clienteId", "id cliente"], ["cliente", "nombreCliente", "nombre cliente"], cache.clientes, ["nombreCliente"]),
      estatusId: resolveReferenceId(row, ["estatusId", "id estatus"], ["estatus"], cache.estatus, ["descripcion"], cache.estatus[0]?.id),
      ordenCompra: textFromCsv(row, ["ordenCompra", "orden compra", "oc"]),
      noParte: textFromCsv(row, ["noParte", "no parte", "numero parte"]),
      noDibujo: textFromCsv(row, ["noDibujo", "no dibujo", "numero dibujo"]),
      descripcion: textFromCsv(row, ["descripcion", "descripcion pieza"]),
      cantidad: numberFromCsv(row, ["cantidad", "cant"], 1),
      cantidadEntregada: numberFromCsv(row, ["cantidadEntregada", "cantidad entregada"], 0),
      fechaRequerimiento: dateFromCsv(row, ["fechaRequerimiento", "fecha requerimiento"], todayDate()),
      fechaCompromiso: dateFromCsv(row, ["fechaCompromiso", "fecha compromiso"], defaultCommitmentDate()),
      precio: numberFromCsv(row, ["precio"], 0),
      monedaPrecio: textFromCsv(row, ["monedaPrecio", "moneda precio", "moneda"], "MXN"),
      tipoCambioUsdMxn: numberFromCsv(row, ["tipoCambioUsdMxn", "tipo cambio", "tc usd mxn"], 1),
      material: textFromCsv(row, ["material"]),
      tratamiento: textFromCsv(row, ["tratamiento"]),
      archivo: textFromCsv(row, ["archivo"]),
      entregado: boolFromCsv(row, ["entregado"], false)
    })
  },
  ordenes: {
    label: "ordenes de trabajo",
    endpoint: "/api/ordenes-trabajo",
    map: row => ({
      clienteId: resolveReferenceId(row, ["clienteId", "id cliente"], ["cliente", "nombreCliente", "nombre cliente"], cache.clientes, ["nombreCliente"]),
      ordenCompra: textFromCsv(row, ["ordenCompra", "orden compra", "oc"]),
      fechaCompromiso: dateFromCsv(row, ["fechaCompromiso", "fecha compromiso"], defaultCommitmentDate()),
      observaciones: textFromCsv(row, ["observaciones"]),
      piezaIds: idsFromCsv(row, ["piezaIds", "piezas", "ids piezas", "id pieza"])
    })
  },
  monitor: {
    label: "estatus de monitor",
    importRows: async rows => {
      let imported = 0;
      for (const row of rows) {
        const piezaId = numberFromCsv(row, ["piezaId", "pieza", "id pieza"]);
        const estatusId = resolveReferenceId(row, ["estatusId", "id estatus"], ["estatus"], cache.estatus, ["descripcion"]);
        if (!piezaId || !estatusId) throw new Error("Cada renglon de monitor necesita piezaId y estatusId/estatus");
        await api(`/api/piezas/${piezaId}/estatus`, {
          method: "PUT",
          body: JSON.stringify({
            estatusId,
            nota: textFromCsv(row, ["nota", "observaciones"])
          })
        });
        imported++;
      }
      return imported;
    }
  },
  tiempos: {
    label: "tiempos",
    endpoint: "/api/tiempos",
    map: row => ({
      piezaId: resolveReferenceId(row, ["piezaId", "pieza", "id pieza"], ["piezaDescripcion", "pieza descripcion", "descripcion"], cache.piezas, ["descripcion"]),
      operadorId: resolveReferenceId(row, ["operadorId", "operador", "id operador"], ["operadorNombre", "nombre operador"], cache.operadores, ["nombreOperador"]),
      estatusId: resolveReferenceId(row, ["estatusId", "estatus", "id estatus"], ["estatusNombre"], cache.estatus, ["descripcion"], cache.estatus[0]?.id),
      descripcionOperacion: textFromCsv(row, ["descripcionOperacion", "operacion", "descripcion operacion"], "Operacion importada"),
      inicio: dateTimeFromCsv(row, ["inicio"], `${todayDate()}T08:00`),
      fin: dateTimeFromCsv(row, ["fin"], `${todayDate()}T09:00`)
    })
  },
  requisiciones: {
    label: "requisiciones",
    endpoint: "/api/requisiciones",
    map: row => ({
      solicitante: textFromCsv(row, ["solicitante", "nombre solicitante"]),
      prioridad: textFromCsv(row, ["prioridad"], "Normal"),
      observaciones: textFromCsv(row, ["observaciones"]),
      detalles: [{
        piezaId: numberFromCsv(row, ["piezaId", "id pieza"], GODMISA_INTERNAL_PIEZA_ID),
        descripcion: textFromCsv(row, ["descripcion", "descripcion material", "detalle"]),
        cantidad: numberFromCsv(row, ["cantidad", "cant"], 1),
        unidadMedida: textFromCsv(row, ["unidadMedida", "unidad", "medida"], "PIEZAS"),
        destino: textFromCsv(row, ["destino"], GODMISA_INTERNAL_DESTINO),
        material: textFromCsv(row, ["material"])
      }]
    })
  },
  ordenesCompra: {
    label: "ordenes de compra",
    importRows: importOrdenesCompraCsv
  },
  almacen: {
    label: "articulos de almacen",
    endpoint: "/api/almacen/articulos",
    map: row => ({
      descripcion: textFromCsv(row, ["descripcion", "articulo"]),
      medida: textFromCsv(row, ["medida", "unidad"], "pieza"),
      existencia: numberFromCsv(row, ["existencia"], 0),
      minimo: numberFromCsv(row, ["minimo"], 0),
      maximo: numberFromCsv(row, ["maximo"], 0),
      puntoReorden: numberFromCsv(row, ["puntoReorden", "punto reorden", "reorden"], 0),
      activo: boolFromCsv(row, ["activo"], true)
    })
  },
  remisiones: {
    label: "remisiones",
    endpoint: "/api/remisiones",
    map: row => ({
      piezaId: numberFromCsv(row, ["piezaId", "pieza", "id pieza"]),
      cantidadEntregada: numberFromCsv(row, ["cantidadEntregada", "cantidad entregada", "cantidad"], 1),
      observaciones: textFromCsv(row, ["observaciones"]),
      autorizacion: textFromCsv(row, ["autorizacion"]),
      chofer: textFromCsv(row, ["chofer"]),
      activo: boolFromCsv(row, ["activo"], true)
    })
  }
};

document.querySelector("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  clearToken();
  const form = event.currentTarget;
  const submitButton = form.querySelector("button[type='submit']");
  const loginError = document.querySelector("#login-error");
  loginError.textContent = "Validando acceso...";
  submitButton.disabled = true;
  try {
    const credentials = formData(form);
    credentials.username = credentials.username.trim();
    const response = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials)
    });
    setToken(response.token);
    loginError.textContent = "";
    await boot();
  } catch (error) {
    clearToken();
    loginError.textContent = error.message || "No se pudo iniciar sesion";
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST" }); } catch { /* no-op */ }
  clearToken();
  showLogin();
});

navToggle.addEventListener("click", () => {
  const open = appView.classList.toggle("nav-open");
  navToggle.setAttribute("aria-expanded", String(open));
});

menuHomeButton.addEventListener("click", () => navigate("menuGeneral"));

nav.addEventListener("click", event => {
  const button = event.target.closest("button[data-view]");
  if (button) {
    closeNavigation();
    navigate(button.dataset.view);
  }
});

document.addEventListener("keydown", event => {
  if (currentViewName === "monitor") {
    const shortcut = MONITOR_SHORTCUTS.find(item => item.key === event.key);
    if (!shortcut) return;
    event.preventDefault();
    void handleMonitorShortcut(shortcut.action).catch(error => {
      setMonitorMessage(error.message || "No se pudo ejecutar el atajo", "error");
    });
    return;
  }
  if (currentViewName === "requisiciones" && event.key === "F3") {
    event.preventDefault();
    removeSelectedRequisicionPartida();
  }
});

window.matchMedia("(min-width: 901px)").addEventListener("change", closeNavigation);

if (getToken()) {
  boot().catch(() => {
    clearToken();
    showLogin();
  });
} else {
  showLogin();
}

async function boot() {
  const me = await api("/api/auth/me");
  currentUser.textContent = me.displayName;
  loginView.hidden = true;
  appView.hidden = false;
  await loadReferenceData();
  await navigate("dashboard");
}

function showLogin() {
  loginView.hidden = false;
  appView.hidden = true;
  closeNavigation();
}

async function navigate(viewName) {
  closeNavigation();
  const activeViewName = views[viewName] ? viewName : "dashboard";
  const view = views[activeViewName];
  currentViewName = activeViewName;
  title.textContent = view.title;
  eyebrow.textContent = view.eyebrow || "MVP Tornos";
  actions.innerHTML = "";
  root.innerHTML = document.querySelector("#loading-template").innerHTML;
  const activeNavViewName = activeNavViewFor(activeViewName);
  nav.querySelectorAll("button").forEach(button => button.classList.toggle("active", button.dataset.view === activeNavViewName));
  try {
    await view.render();
    configureExportToolbar(activeViewName);
  } catch (error) {
    root.innerHTML = `<div class="panel error-message">${escapeHtml(error.message)}</div>`;
  }
}

function closeNavigation() {
  appView.classList.remove("nav-open");
  navToggle.setAttribute("aria-expanded", "false");
}

async function loadReferenceData() {
  const [clientes, proveedores, estatus, operadores, piezas, articulos] = await Promise.all([
    api("/api/clientes"),
    api("/api/proveedores"),
    api("/api/estatus-produccion"),
    api("/api/operadores"),
    api("/api/piezas"),
    api("/api/almacen/articulos")
  ]);
  cache = { clientes, proveedores, estatus, operadores, piezas, articulos };
}

function renderMenuSection(sectionId) {
  const section = menuSections.find(item => item.id === sectionId) || menuSections[0];
  root.innerHTML = `
    <div class="app-card-grid">
      ${section.items.map(viewName => menuCard(viewName)).join("")}
    </div>`;
  root.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.go));
  });
}

function renderMenuGeneral() {
  root.innerHTML = `
    <section class="panel main-menu-panel">
      <div class="panel-title-row">
        <h3>Menu general</h3>
        <span class="muted">Accesos principales</span>
      </div>
      <div class="app-card-grid">
        ${mainMenuItems.map(viewName => menuCard(viewName)).join("")}
      </div>
    </section>`;
  root.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.go));
  });
}

function menuCard(viewName) {
  const card = moduleCards[viewName];
  const view = views[viewName];
  if (!card || !view) return "";
  const imageSrc = card.image ? `${MENU_ICON_BASE}${card.image}` : "";
  return `
    <button class="app-card" type="button" data-go="${escapeHtml(viewName)}" data-tone="${escapeHtml(card.tone || "blue")}">
      <span class="app-card-visual" aria-hidden="true">
        ${imageSrc ? `<img class="app-card-image" src="${escapeHtml(imageSrc)}" alt="" loading="lazy">` : ""}
        <span class="app-card-initials">${escapeHtml(card.icon)}</span>
      </span>
      <span class="app-card-label">${escapeHtml(card.label)}</span>
      <span class="app-card-detail">${escapeHtml(card.detail)}</span>
    </button>`;
}

function activeNavViewFor(viewName) {
  if (menuSections.some(section => section.id === viewName)) return viewName;
  return moduleCards[viewName]?.parent || viewName;
}

async function renderDashboard() {
  await loadReferenceData();
  const [requisiciones, ordenesCompra, ordenesTrabajo, remisiones] = await Promise.all([
    api("/api/requisiciones"),
    api("/api/ordenes-compra"),
    api("/api/ordenes-trabajo"),
    api("/api/remisiones")
  ]);
  const today = todayDate();
  const soonDate = new Date();
  soonDate.setDate(soonDate.getDate() + 7);
  const soonLimit = soonDate.toISOString().slice(0, 10);

  const trackedPieces = cache.piezas.filter(p => p.id !== GODMISA_INTERNAL_PIEZA_ID);
  const pendingPieces = trackedPieces.filter(p => !p.entregado);
  const overduePieces = pendingPieces.filter(p => p.fechaCompromiso && p.fechaCompromiso < today);
  const dueSoonPieces = pendingPieces.filter(p => p.fechaCompromiso && p.fechaCompromiso >= today && p.fechaCompromiso <= soonLimit);
  const deliveredPieces = trackedPieces.filter(p => p.entregado);
  const completionPct = trackedPieces.length ? Math.min(100, Math.round((deliveredPieces.length / trackedPieces.length) * 100)) : 100;
  const statusCounts = countBy(pendingPieces, p => p.estatus || "Sin estatus");
  const activeReqs = requisiciones.filter(r => !r.surtido && !r.cancelado);
  const reqsWithoutOc = activeReqs.filter(r => !r.enviadaACompras);
  const reorderItems = cache.articulos.filter(a => Number(a.existencia || 0) <= Number(a.puntoReorden || 0));
  const ocTotal = ordenesCompra.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const ocWithRetentions = ordenesCompra.filter(order => (Number(order.retencionIva || 0) + Number(order.retencionIsr || 0)) > 0);
  const pendingRemision = pendingPieces.filter(p => Number(p.cantidadEntregada || 0) < Number(p.cantidad || 0));

  const rubros = [
    dashboardRubro("Produccion", pendingPieces.length, overduePieces.length, dueSoonPieces.length, "Monitor", "monitor"),
    dashboardRubro("Ordenes de trabajo", ordenesTrabajo.length, overduePieces.length, 0, "OT", "ordenes"),
    dashboardRubro("Compras", activeReqs.length, reqsWithoutOc.length, ocWithRetentions.length, "Compras", "ordenesCompra"),
    dashboardRubro("Almacen", cache.articulos.length, reorderItems.length, 0, "Almacen", "almacen"),
    dashboardRubro("Remisiones", remisiones.length, pendingRemision.length, 0, "Remisiones", "remisiones")
  ];
  const criticalRows = dashboardCriticalRows(overduePieces, reqsWithoutOc, reorderItems);

  root.innerHTML = `
    <div class="dashboard-shell">
      <aside class="dashboard-left">
        <section class="panel dashboard-meter-panel">
          <div class="panel-title-row">
            <h3>Cumplimiento</h3>
            ${dashboardStatusBadge(overduePieces.length ? "Critico" : "En orden", overduePieces.length ? "danger" : "ok")}
          </div>
          <div class="dashboard-meter" style="--meter-value:${completionPct}">
            <strong>${completionPct}%</strong>
            <span>piezas entregadas</span>
          </div>
          <div class="meter-scale">
            <span>0</span>
            <span>Meta 90%</span>
            <span>100</span>
          </div>
        </section>
        <section class="panel">
          <div class="panel-title-row">
            <h3>Pendientes por estatus</h3>
            <span class="muted">${pendingPieces.length} abiertos</span>
          </div>
          ${statusBars(statusCounts, pendingPieces.length)}
        </section>
      </aside>

      <section class="dashboard-main">
        <div class="dashboard-kpi-strip">
          ${dashboardKpi("Piezas pendientes", pendingPieces.length, `${overduePieces.length} vencidas`, overduePieces.length ? "danger" : "ok")}
          ${dashboardKpi("Requisiciones abiertas", activeReqs.length, `${reqsWithoutOc.length} sin OC`, reqsWithoutOc.length ? "warning" : "ok")}
          ${dashboardKpi("OT abiertas", ordenesTrabajo.length, `${dueSoonPieces.length} vencen en 7 dias`, dueSoonPieces.length ? "warning" : "ok")}
          ${dashboardKpi("Almacen reorden", reorderItems.length, `${cache.articulos.length} articulos`, reorderItems.length ? "danger" : "ok")}
          ${dashboardKpi("OC total", formatMoney(ocTotal), `${ocWithRetentions.length} con retencion`, ocWithRetentions.length ? "warning" : "ok")}
        </div>

        <section class="panel">
          <div class="panel-title-row">
            <h3>Visibilidad por rubro</h3>
            <span class="muted">Estatus operativo al ${today}</span>
          </div>
          ${table(["Rubro", "Abiertos", "Criticos", "Proximos", "Estatus", "Ir a"], rubros.map(rubro => [
            rubro.label,
            rubro.open,
            rubro.critical,
            rubro.warning,
            dashboardStatusBadge(rubro.status, rubro.tone),
            `<button class="secondary" data-dashboard-go="${rubro.view}">${rubro.action}</button>`
          ]))}
        </section>

        <section class="panel">
          <div class="panel-title-row">
            <h3>Pendientes criticos</h3>
            <span class="muted">vencidos, sin OC o bajo reorden</span>
          </div>
          ${table(["Rubro", "ID/Folio", "Referencia", "Fecha/Valor", "Estatus", "Accion"], criticalRows)}
        </section>
      </section>

      <aside class="dashboard-right">
        <section class="panel">
          <div class="panel-title-row">
            <h3>Distribucion produccion</h3>
            <span class="muted">${trackedPieces.length} piezas</span>
          </div>
          ${donutChart(statusCounts, pendingPieces.length)}
        </section>
        <section class="panel">
          <h3>Resumen rapido</h3>
          <div class="dashboard-summary-list">
            ${summaryItem("Compras", `${activeReqs.length} requisiciones abiertas`, reqsWithoutOc.length ? `${reqsWithoutOc.length} requieren OC` : "sin bloqueos", reqsWithoutOc.length ? "warning" : "ok")}
            ${summaryItem("Remisiones", `${pendingRemision.length} piezas pendientes`, `${remisiones.length} remisiones generadas`, pendingRemision.length ? "warning" : "ok")}
            ${summaryItem("Proveedores", `${cache.proveedores.length} activos`, `${ocWithRetentions.length} con retenciones en OC`, ocWithRetentions.length ? "warning" : "ok")}
          </div>
        </section>
      </aside>
    </div>`;
  document.querySelectorAll("[data-dashboard-go]").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.dashboardGo));
  });
}

function dashboardKpi(label, value, detail, tone = "ok") {
  return `
    <div class="dashboard-kpi ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>`;
}

function dashboardRubro(label, open, critical, warning, action, view) {
  const tone = critical > 0 ? "danger" : warning > 0 ? "warning" : "ok";
  const status = tone === "danger" ? "Critico" : tone === "warning" ? "Atencion" : "En orden";
  return { label, open, critical, warning, action, view, tone, status };
}

function dashboardCriticalRows(overduePieces, reqsWithoutOc, reorderItems) {
  const rows = [];
  overduePieces
    .sort((a, b) => String(a.fechaCompromiso || "").localeCompare(String(b.fechaCompromiso || "")))
    .slice(0, 6)
    .forEach(p => rows.push([
      "Produccion",
      p.id,
      `${escapeHtml(p.clienteNombre || "")} | ${escapeHtml(p.descripcion || "")}`,
      p.fechaCompromiso || "",
      dashboardStatusBadge("Vencida", "danger"),
      `<button class="secondary" data-dashboard-go="monitor">Monitor</button>`
    ]));

  reqsWithoutOc.slice(0, 4).forEach(r => rows.push([
    "Compras",
    `Req ${r.folio}`,
    r.solicitante || "",
    formatDateTime(r.fecha),
    dashboardStatusBadge("Sin OC", "warning"),
    `<button class="secondary" data-dashboard-go="ordenesCompra">OC</button>`
  ]));

  reorderItems.slice(0, 4).forEach(a => rows.push([
    "Almacen",
    a.id,
    a.descripcion || "",
    `Exist. ${a.existencia ?? 0} / Reorden ${a.puntoReorden ?? 0}`,
    dashboardStatusBadge("Reorden", "danger"),
    `<button class="secondary" data-dashboard-go="almacen">Almacen</button>`
  ]));

  if (rows.length) return rows;
  return [[
    "General",
    "-",
    "Sin pendientes criticos detectados",
    todayDate(),
    dashboardStatusBadge("En orden", "ok"),
    `<button class="secondary" data-dashboard-go="monitor">Ver monitor</button>`
  ]];
}

function statusBars(counts, total) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="empty-state">Sin piezas pendientes</div>`;
  return `<div class="status-bars">${entries.map(([label, value], index) => {
    const pct = total ? Math.round((value / total) * 100) : 0;
    const color = DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length];
    return `
      <div class="status-bar-row">
        <div>
          <strong>${escapeHtml(label)}</strong>
          <span>${value} pieza(s)</span>
        </div>
        <div class="status-bar-track"><span style="width:${pct}%;background:${color}"></span></div>
        <em>${pct}%</em>
      </div>`;
  }).join("")}</div>`;
}

function donutChart(counts, total) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="empty-state">Sin pendientes para graficar</div>`;
  let cursor = 0;
  const gradient = entries.map(([_, value], index) => {
    const start = cursor;
    cursor += total ? (value / total) * 100 : 0;
    return `${DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length]} ${start}% ${cursor}%`;
  }).join(", ");
  return `
    <div class="donut-layout">
      <div class="donut-chart" style="background:conic-gradient(${gradient})">
        <span>${total}</span>
      </div>
      <div class="donut-legend">
        ${entries.map(([label, value], index) => `
          <span><i style="background:${DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length]}"></i>${escapeHtml(label)} (${value})</span>
        `).join("")}
      </div>
    </div>`;
}

function summaryItem(label, value, detail, tone) {
  return `
    <div class="summary-item ${tone}">
      <div>
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(value)}</span>
      </div>
      <em>${escapeHtml(detail)}</em>
    </div>`;
}

function dashboardStatusBadge(value, tone) {
  return `<span class="badge ${tone}">${escapeHtml(value)}</span>`;
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

async function renderClientes() {
  const rows = await api("/api/clientes");
  root.innerHTML = `
    <div class="grid-2">
      <form class="panel form-grid" id="cliente-form">
        <label>Nombre<input name="nombreCliente" required></label>
        <label>Razon social<input name="razonSocial"></label>
        <label>RFC<input name="rfc"></label>
        <label>Calle<input name="calle"></label>
        <label>Colonia<input name="colonia"></label>
        <label>Municipio<input name="municipio"></label>
        <label>Estado<input name="estado"></label>
        <label>CP<input name="cp"></label>
        <input type="hidden" name="formatoFactura" value="true">
        <input type="hidden" name="activo" value="true">
        <button>Guardar cliente</button>
      </form>
      ${table(["ID", "Nombre", "RFC", "Razon social"], rows.map(c => [c.id, c.nombreCliente, c.rfc || "", c.razonSocial || ""]))}
    </div>`;
  document.querySelector("#cliente-form").addEventListener("submit", submitJson("/api/clientes", () => navigate("clientes")));
}

async function renderProveedores() {
  const rows = await api("/api/proveedores");
  root.innerHTML = `
    <div class="grid-2">
      <form class="panel form-grid" id="proveedor-form">
        <label>Nombre<input name="nombreProveedor" required></label>
        <label>Razon social<input name="razonSocial"></label>
        <label>Representante legal<input name="representanteLegal"></label>
        <label>RFC<input name="rfc"></label>
        <label class="wide">Direccion fiscal<input name="direccionFiscal"></label>
        <label>Ciudad<input name="ciudad"></label>
        <label>Telefono<input name="telefono"></label>
        <label>Fax<input name="fax"></label>
        <label>Contacto<input name="contacto"></label>
        <label>Correo<input name="correo" type="email"></label>
        <label>Calle / direccion adicional<input name="calle"></label>
        <label>Municipio<input name="municipio"></label>
        <label>Estado<input name="estado"></label>
        <label>CP<input name="cp"></label>
        <label>Banco<input name="banco" list="bancos-list"></label>
        <label>CLABE<input name="clabe" inputmode="numeric" maxlength="30"></label>
        <label>No. cuenta<input name="numeroCuenta"></label>
        <label>Ret. IVA %<input name="retencionIvaPct" type="number" step="0.0001" value="0"></label>
        <label>Ret. ISR %<input name="retencionIsrPct" type="number" step="0.0001" value="0"></label>
        <label class="wide">Condiciones de pago<input name="condicionesPago" list="condiciones-pago-list" value="Credito 30 dias"></label>
        <datalist id="bancos-list">
          <option value="BANAMEX"></option>
          <option value="BBVA"></option>
          <option value="BANORTE"></option>
          <option value="SANTANDER"></option>
          <option value="HSBC"></option>
        </datalist>
        <datalist id="condiciones-pago-list">
          <option value="CONTADO"></option>
          <option value="Credito 15 dias"></option>
          <option value="Credito 30 dias"></option>
          <option value="Credito 45 dias"></option>
        </datalist>
        <input type="hidden" name="activo" value="true">
        <button>Guardar proveedor</button>
      </form>
      ${table(["ID", "Proveedor", "RFC", "Ciudad", "Contacto", "Pago", "Banco", "Cuenta", "Ret. IVA", "Ret. ISR"], rows.map(p => [
        p.id,
        p.nombreProveedor,
        p.rfc || "",
        p.ciudad || p.municipio || "",
        p.contacto || "",
        p.condicionesPago || "",
        p.banco || "",
        p.numeroCuenta || p.clabe || "",
        `${formatPercent(p.retencionIvaPct)}%`,
        `${formatPercent(p.retencionIsrPct)}%`
      ]))}
    </div>`;
  document.querySelector("#proveedor-form").addEventListener("submit", submitJson("/api/proveedores", () => navigate("proveedores")));
}

async function renderAltas() {
  await loadReferenceData();
  const pendientes = cache.piezas.filter(p => !p.entregado && !p.ordenTrabajoId && p.id !== GODMISA_INTERNAL_PIEZA_ID);
  root.innerHTML = `
    <div class="module-grid">
      <button class="module-tile" data-go="piezas">
        <span>Alta de piezas</span>
        <strong>${cache.piezas.length}</strong>
      </button>
      <button class="module-tile" data-go="ordenes">
        <span>Ordenes de trabajo</span>
        <strong>${pendientes.length}</strong>
      </button>
      <button class="module-tile" data-go="clientes">
        <span>Clientes</span>
        <strong>${cache.clientes.length}</strong>
      </button>
      <button class="module-tile" data-go="proveedores">
        <span>Proveedores</span>
        <strong>${cache.proveedores.length}</strong>
      </button>
      <button class="module-tile" data-go="operadores">
        <span>Operadores</span>
        <strong>${cache.operadores.length}</strong>
      </button>
      <button class="module-tile" data-go="ordenesCompra">
        <span>Ordenes de compra</span>
        <strong>${(await api("/api/ordenes-compra")).length}</strong>
      </button>
    </div>
    ${table(["ID", "Cliente", "OC", "No. parte", "Descripcion", "Cant.", "Compromiso", "Estatus"], pendientes.map(p => [
      p.id,
      p.clienteNombre,
      p.ordenCompra,
      p.noParte || "",
      p.descripcion,
      p.cantidad,
      p.fechaCompromiso,
      p.estatus
    ]))}`;
  document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.go));
  });
}

async function renderOperadores() {
  const rows = await api("/api/operadores");
  root.innerHTML = `
    <div class="grid-2">
      <form class="panel form-grid" id="operador-form">
        <label>Nombre<input name="nombreOperador" required></label>
        <label>Turno<input name="turno" type="number" value="1"></label>
        <label>Supervisor<select name="supervisor"><option value="false">No</option><option value="true">Si</option></select></label>
        <label>Chofer<select name="chofer"><option value="false">No</option><option value="true">Si</option></select></label>
        <input type="hidden" name="activo" value="true">
        <button>Guardar operador</button>
      </form>
      ${table(["ID", "Nombre", "Turno", "Supervisor", "Chofer"], rows.map(o => [o.id, o.nombreOperador, o.turno, yesNo(o.supervisor), yesNo(o.chofer)]))}
    </div>`;
  document.querySelector("#operador-form").addEventListener("submit", submitJson("/api/operadores", () => navigate("operadores")));
}

function renderActividades() {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-title-row">
        <h3>Actividades oficiales</h3>
        <span class="badge ok">Fuente Cosmos</span>
      </div>
      <div class="activity-grid">
        ${OFFICIAL_ACTIVITIES.map(activityCard).join("")}
      </div>
    </section>
    ${table(["Actividad", "Categoria", "Proveedor", "Cobertura", "Descripcion", "Fuente"], OFFICIAL_ACTIVITIES.map(activity => [
      escapeHtml(activity.name),
      escapeHtml(activity.category),
      escapeHtml(activity.provider),
      escapeHtml(activity.coverage),
      escapeHtml(activity.description),
      `<a href="${escapeHtml(activity.source)}" target="_blank" rel="noopener">Cosmos</a>`
    ]))}`;
}

function activityCard(activity) {
  return `
    <article class="activity-card">
      <span class="badge">${escapeHtml(activity.category)}</span>
      <h3>${escapeHtml(activity.name)}</h3>
      <p>${escapeHtml(activity.description)}</p>
      <div class="activity-meta">
        <span>${escapeHtml(activity.provider)}</span>
        <span>Cobertura ${escapeHtml(activity.coverage)}</span>
      </div>
      <a href="${escapeHtml(activity.source)}" target="_blank" rel="noopener">Ver fuente oficial</a>
    </article>`;
}

async function renderPiezas() {
  await loadReferenceData();
  root.innerHTML = `
    <div class="panel">
      <form class="form-grid" id="pieza-form">
        <label>Cliente<select name="clienteId" required>${options(cache.clientes, "id", "nombreCliente")}</select></label>
        <label>Estatus<select name="estatusId" required>${options(cache.estatus, "id", "descripcion")}</select></label>
        <label>Orden compra<input name="ordenCompra"></label>
        <label>No. parte<input name="noParte"></label>
        <label>No. dibujo<input name="noDibujo"></label>
        <label>Cantidad<input name="cantidad" type="number" min="1" value="1" required></label>
        <label>Fecha requerimiento<input name="fechaRequerimiento" type="date" value="${todayDate()}"></label>
        <label>Fecha compromiso<input name="fechaCompromiso" type="date" required></label>
        <label>Precio<input name="precio" type="number" step="0.01" min="0" value="0"></label>
        <label>Moneda precio<select name="monedaPrecio" id="precio-moneda"><option value="MXN">Pesos MXN</option><option value="USD">Dolares USD</option></select></label>
        <label id="tipo-cambio-field">Tipo cambio USD/MXN<input name="tipoCambioUsdMxn" type="number" step="0.0001" min="0" value="1"></label>
        <div class="price-hint" id="precio-mxn-preview">Precio MXN: ${formatMoney(0)}</div>
        <label>Material<input name="material"></label>
        <label>Tratamiento<input name="tratamiento"></label>
        <label class="drawing-upload">Archivo / dibujo cliente
          <input id="archivo-dibujo" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.dwg,.dxf,.step,.stp,image/*,application/pdf">
          <input name="archivo" type="hidden">
          <span class="drawing-file-name" id="archivo-dibujo-name">Sin dibujo seleccionado</span>
        </label>
        <label class="wide">Descripcion<textarea name="descripcion" required></textarea></label>
        <input type="hidden" name="entregado" value="false">
        <div class="wide split-actions">
          <button>Guardar pieza</button>
          <button class="secondary" type="button" data-next="ordenes">Generar OT</button>
        </div>
      </form>
    </div>
    ${table(["ID", "Cliente", "OC", "No. parte", "Descripcion", "Cant.", "Precio", "Dibujo", "Compromiso", "Estatus"], cache.piezas.map(p => [
      p.id,
      p.clienteNombre,
      p.ordenCompra,
      p.noParte || "",
      p.descripcion,
      p.cantidad,
      piecePriceLabel(p),
      drawingLabel(p.archivo),
      p.fechaCompromiso,
      p.estatus
    ]))}`;
  const piezaForm = document.querySelector("#pieza-form");
  setupPiezaPriceControls(piezaForm);
  setupDrawingInput(piezaForm);
  piezaForm.addEventListener("submit", submitPiezaForm);
  document.querySelector("[data-next='ordenes']").addEventListener("click", () => navigate("ordenes"));
}

function setupPiezaPriceControls(form) {
  const moneda = form.monedaPrecio;
  const tipoCambio = form.tipoCambioUsdMxn;
  const tipoCambioField = document.querySelector("#tipo-cambio-field");
  const preview = document.querySelector("#precio-mxn-preview");
  const update = () => {
    const isUsd = moneda.value === "USD";
    tipoCambioField.hidden = !isUsd;
    if (!isUsd) tipoCambio.value = "1";
    const precio = Number(form.precio.value || 0);
    const cambio = Number(tipoCambio.value || 0);
    const precioMxn = isUsd ? precio * cambio : precio;
    preview.textContent = isUsd
      ? `Precio MXN: ${formatMoney(precioMxn)} (${formatUsd(precio)} x TC ${formatExchangeRate(cambio)})`
      : `Precio MXN: ${formatMoney(precioMxn)}`;
  };
  [form.precio, moneda, tipoCambio].forEach(field => field.addEventListener("input", update));
  moneda.addEventListener("change", update);
  update();
}

function setupDrawingInput(form) {
  const input = document.querySelector("#archivo-dibujo");
  const label = document.querySelector("#archivo-dibujo-name");
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    form.archivo.value = "";
    label.textContent = file ? file.name : "Sin dibujo seleccionado";
  });
}

async function submitPiezaForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector("button[type='submit'], button:not([type])");
  const drawingInput = document.querySelector("#archivo-dibujo");
  submitButton.disabled = true;
  try {
    const file = drawingInput.files?.[0];
    if (file) {
      const upload = new FormData();
      upload.append("archivo", file);
      const response = await api("/api/piezas/dibujos", { method: "POST", body: upload });
      form.archivo.value = response.archivo;
    }
    const payload = normalize(formData(form));
    await api("/api/piezas", { method: "POST", body: JSON.stringify(payload) });
    await navigate("piezas");
  } finally {
    submitButton.disabled = false;
  }
}

function piecePriceLabel(pieza) {
  const moneda = pieza.monedaPrecio || "MXN";
  const precio = Number(pieza.precio || 0);
  if (moneda === "USD") {
    return `${formatUsd(precio)} / ${formatMoney(pieza.precioMxn || precio * Number(pieza.tipoCambioUsdMxn || 0))}`;
  }
  return formatMoney(precio);
}

function drawingLabel(archivo) {
  if (!archivo) return "";
  const name = String(archivo).split(/[\\/]/).pop();
  return `<span class="drawing-file-name">${escapeHtml(name)}</span>`;
}

async function renderOrdenes() {
  await loadReferenceData();
  const ordenes = await api("/api/ordenes-trabajo");
  const pendientes = cache.piezas.filter(p => !p.entregado && !p.ordenTrabajoId && p.id !== GODMISA_INTERNAL_PIEZA_ID);
  const clienteInicial = pendientes[0]?.clienteId || cache.clientes[0]?.id || "";
  const previewOrden = ordenes.find(orden => orden.id === lastOrdenTrabajoPreviewId) || ordenes[0] || null;
  root.innerHTML = `
    <div class="ot-workspace">
      <form class="panel form-grid" id="ot-form">
        <label>Cliente<select name="clienteId" required>${options(cache.clientes, "id", "nombreCliente", clienteInicial)}</select></label>
        <label>Orden compra<input name="ordenCompra" required></label>
        <label>Fecha compromiso<input name="fechaCompromiso" type="date" required value="${defaultCommitmentDate()}"></label>
        <label class="wide">Observaciones<textarea name="observaciones"></textarea></label>
        <div class="wide">
          <div class="section-label">Piezas sin OT</div>
          <div class="pending-pieces-list" id="ot-pending-list"></div>
        </div>
        <p class="wide muted" id="ot-selection-summary"></p>
        <button id="ot-submit-button" disabled>Generar OT</button>
      </form>
      <div class="ot-side">
        <div id="ot-preview">${ordenTrabajoPreview(previewOrden, cache.piezas)}</div>
        ${table(["OT", "Cliente", "OC", "Compromiso", "Piezas", ""], ordenes.map(o => [
          o.id,
          o.clienteNombre,
          o.ordenCompra || "",
          o.fechaCompromiso,
          o.piezaIds?.length || 0,
          `<button class="secondary compact-button ot-preview-button" data-ot-id="${o.id}">Ver</button>`
        ]))}
      </div>
    </div>`;
  const form = document.querySelector("#ot-form");
  const clienteSelect = form.clienteId;
  const pendingList = document.querySelector("#ot-pending-list");
  const summary = document.querySelector("#ot-selection-summary");
  const submitButton = document.querySelector("#ot-submit-button");
  const updateSummary = () => {
    const selected = pendingList.querySelectorAll("input[name='piezaIds']:checked").length;
    submitButton.disabled = selected === 0;
    if (selected > 0) {
      summary.textContent = `${selected} pieza(s) seleccionada(s) para enlazar a la OT`;
    }
  };
  const updatePiezas = () => {
    const clienteId = Number(clienteSelect.value);
    const piezasCliente = pendientes.filter(p => p.clienteId === clienteId);
    pendingList.innerHTML = piezasCliente.length
      ? piezasCliente.map(pendingPiezaCard).join("")
      : `<div class="empty-state inline-empty">Sin piezas pendientes para este cliente</div>`;
    pendingList.querySelectorAll("input[name='piezaIds']").forEach(input => {
      input.addEventListener("change", updateSummary);
    });
    summary.textContent = piezasCliente.length
      ? `${piezasCliente.length} pieza(s) pendiente(s) para este cliente`
      : "Sin piezas pendientes para este cliente";
    submitButton.disabled = true;
  };
  clienteSelect.addEventListener("change", updatePiezas);
  updatePiezas();
  document.querySelectorAll(".ot-preview-button").forEach(button => {
    button.addEventListener("click", () => {
      const orden = ordenes.find(item => item.id === Number(button.dataset.otId));
      lastOrdenTrabajoPreviewId = orden?.id || null;
      document.querySelector("#ot-preview").innerHTML = ordenTrabajoPreview(orden, cache.piezas);
    });
  });
  document.querySelector("#ot-form").addEventListener("submit", async event => {
    event.preventDefault();
    const data = formData(event.currentTarget);
    data.piezaIds = [...pendingList.querySelectorAll("input[name='piezaIds']:checked")].map(input => Number(input.value));
    if (!data.piezaIds.length) return;
    data.clienteId = Number(data.clienteId);
    const created = await api("/api/ordenes-trabajo", { method: "POST", body: JSON.stringify(data) });
    lastOrdenTrabajoPreviewId = created.id;
    await navigate("ordenes");
  });
}

function pendingPiezaCard(pieza) {
  const oc = pieza.ordenCompra ? `OC ${pieza.ordenCompra}` : "Sin OC";
  const noParte = pieza.noParte || "Sin no. parte";
  return `
    <label class="pending-piece">
      <input type="checkbox" name="piezaIds" value="${pieza.id}">
      <span class="pending-piece-main">
        <strong>#${pieza.id} ${escapeHtml(pieza.descripcion || "")}</strong>
        <span>${escapeHtml(`${noParte} | ${oc} | ${pieza.cantidad} pza(s)`)}</span>
      </span>
      <span class="pending-piece-date">${escapeHtml(pieza.fechaCompromiso || "")}</span>
    </label>`;
}

function ordenTrabajoPreview(orden, piezas) {
  if (!orden) {
    return `<div class="panel empty-state">Sin orden de trabajo para previsualizar</div>`;
  }
  const piezasOrden = (orden.piezaIds || []).map(id => piezas.find(pieza => pieza.id === id) || { id });
  return `
    <section class="ot-preview-document" aria-label="Vista previa de orden de trabajo">
      <header class="ot-preview-header">
        <div class="ot-preview-logo">
          <strong>Tornos</strong>
          <span>SA de CV</span>
        </div>
        <div class="ot-preview-title">
          <strong>TORNOS SA DE CV</strong>
          <span>ORDEN DE TRABAJO</span>
        </div>
        <div class="ot-preview-folio">
          <span>FOLIO</span>
          <strong>${String(orden.id || 0).padStart(7, "0")}</strong>
          <span>FECHA</span>
          <strong>${formatDateTimeFull(orden.fecha)}</strong>
        </div>
      </header>
      <div class="ot-preview-meta">
        <span>CLIENTE:</span><strong>${escapeHtml(orden.clienteNombre || "")}</strong>
        <span>ORDEN DE COMPRA:</span><strong>${escapeHtml(orden.ordenCompra || "")}</strong>
        <span>FECHA DE ENTREGA:</span><strong>${formatDateOnly(orden.fechaCompromiso)}</strong>
      </div>
      <table class="ot-preview-table">
        <thead>
          <tr><th>CANTIDAD</th><th>DESCRIPCION</th><th>DIBUJO No.</th></tr>
        </thead>
        <tbody>
          ${piezasOrden.map(pieza => `
            <tr>
              <td>${pieza.cantidad ?? ""}</td>
              <td>
                <strong># ID: ${pieza.id ?? ""}</strong>
                ${escapeHtml(pieza.descripcion || "Pieza no disponible")}
                <br>TRATAMIENTO: ${escapeHtml(pieza.tratamiento || "-")}
              </td>
              <td>${escapeHtml(pieza.noDibujo || "")}</td>
            </tr>`).join("")}
        </tbody>
      </table>
      <div class="ot-preview-observaciones">
        <span>OBSERVACIONES:</span>
        <p>${escapeHtml(orden.observaciones || "")}</p>
      </div>
      <footer class="ot-preview-footer">
        <span>ELABORO</span>
        <span>SUPERVISO</span>
        <span>RECIBIO</span>
      </footer>
    </section>`;
}

async function renderMonitor() {
  await loadReferenceData();
  const rows = await api("/api/monitor-produccion");
  lastMonitorRows = rows;
  if (!rows.some(row => Number(row.piezaId) === Number(selectedMonitorPiezaId))) {
    selectedMonitorPiezaId = rows[0]?.piezaId ?? null;
  }
  root.innerHTML = `
    <div id="status-panel" class="panel" hidden></div>
    ${monitorShortcutHelp()}
    <p class="monitor-selected-summary" id="monitor-selected-summary">${monitorSelectionText()}</p>
    ${monitorTable(rows)}`;
  root.querySelectorAll(".monitor-shortcut-button").forEach(button => {
    button.addEventListener("click", () => {
      void handleMonitorShortcut(button.dataset.monitorAction).catch(error => {
        setMonitorMessage(error.message || "No se pudo ejecutar el atajo", "error");
      });
    });
  });
  root.querySelectorAll(".monitor-row").forEach(row => {
    row.addEventListener("click", () => selectMonitorRow(Number(row.dataset.piezaId)));
    row.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectMonitorRow(Number(row.dataset.piezaId));
      }
    });
  });
  root.querySelectorAll(".status-button").forEach(button => {
    button.addEventListener("click", () => openStatusPanel(Number(button.dataset.piezaId)));
  });
}

function monitorShortcutHelp() {
  return `
    <section class="monitor-shortcuts" aria-label="Ayuda de teclas de funcion">
      ${MONITOR_SHORTCUTS.map(shortcut => `
        <button class="monitor-shortcut-button" type="button" data-monitor-action="${shortcut.action}" title="${shortcut.key} ${escapeHtml(shortcut.label)}">
          <kbd>${shortcut.key}</kbd>
          <span>${escapeHtml(shortcut.label)}</span>
        </button>
      `).join("")}
      <span class="monitor-shortcut-message" id="monitor-shortcut-message" role="status"></span>
    </section>`;
}

function monitorTable(rows) {
  if (!rows.length) return `<div class="table-wrap empty-state">Sin registros</div>`;
  const headers = ["Pieza", "OT", "Cliente", "OC", "Descripcion", "Cant.", "Entregada", "Compromiso", "Dias", "Estatus", ""];
  const safeHeaders = headers.map(h => escapeHtml(h));
  return `
    <div class="table-wrap monitor-table-wrap">
      <table class="monitor-table">
        <thead><tr>${safeHeaders.map(h => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(p => {
          const piezaId = Number(p.piezaId);
          const selected = piezaId === Number(selectedMonitorPiezaId) ? " is-selected" : "";
          const cells = [
            escapeHtml(p.piezaId ?? ""),
            escapeHtml(p.ordenTrabajoId || ""),
            escapeHtml(p.cliente || ""),
            escapeHtml(p.ordenCompra || ""),
            escapeHtml(p.descripcion || ""),
            escapeHtml(p.cantidad ?? ""),
            escapeHtml(p.cantidadEntregada ?? ""),
            escapeHtml(p.fechaCompromiso || ""),
            badge(p.diasCompromiso, p.vencida ? "danger" : "ok"),
            escapeHtml(p.estatus || ""),
            `<button class="secondary status-button" data-pieza-id="${piezaId}">Estatus / notas</button>`
          ];
          return `
            <tr class="monitor-row${selected}" data-pieza-id="${piezaId}" tabindex="0" aria-selected="${selected ? "true" : "false"}">
              ${cells.map((cell, index) => `<td data-label="${safeHeaders[index] || ""}">${cell}</td>`).join("")}
            </tr>`;
        }).join("")}</tbody>
      </table>
    </div>`;
}

function selectMonitorRow(piezaId) {
  selectedMonitorPiezaId = piezaId;
  root.querySelectorAll(".monitor-row").forEach(row => {
    const selected = Number(row.dataset.piezaId) === Number(piezaId);
    row.classList.toggle("is-selected", selected);
    row.setAttribute("aria-selected", String(selected));
  });
  const summary = root.querySelector("#monitor-selected-summary");
  if (summary) summary.textContent = monitorSelectionText();
}

function monitorSelectionText() {
  const row = selectedMonitorRow();
  if (!row) return "Selecciona una pieza del monitor para usar F2, F4, F5, F6, F7 o F12.";
  return `Pieza ${row.piezaId} seleccionada: ${row.cliente || "Sin cliente"} | OC ${row.ordenCompra || "Sin OC"} | ${row.descripcion || "Sin descripcion"}`;
}

function selectedMonitorRow() {
  return lastMonitorRows.find(row => Number(row.piezaId) === Number(selectedMonitorPiezaId)) || null;
}

function selectedMonitorPiece() {
  const row = selectedMonitorRow();
  if (!row) return null;
  return cache.piezas.find(item => Number(item.id) === Number(row.piezaId)) || null;
}

async function handleMonitorShortcut(action) {
  const row = selectedMonitorRow();
  if (!row) {
    setMonitorMessage("Selecciona una pieza del monitor.", "error");
    return;
  }
  const piezaId = Number(row.piezaId);
  if (action === "image") {
    openMonitorDrawing(piezaId);
    return;
  }
  if (action === "estimate") {
    setMonitorMessage("F4 Estimacion: pendiente de campo dedicado; usa Captura de tiempos para registrar avance.", "warning");
    return;
  }
  if (action === "status") {
    await openStatusPanel(piezaId);
    setMonitorMessage(`F5 Cambio de estatus abierto para pieza ${piezaId}.`);
    return;
  }
  if (action === "note") {
    await openStatusPanel(piezaId, { focusNote: true });
    setMonitorMessage(`F6 Nota abierta para pieza ${piezaId}.`);
    return;
  }
  if (action === "partial") {
    if (piezaId === GODMISA_INTERNAL_PIEZA_ID) {
      setMonitorMessage("La pieza interna GODMISA no se da de baja por remision.", "warning");
      return;
    }
    pendingRemisionPiezaId = piezaId;
    await navigate("remisiones");
    return;
  }
  if (action === "pdf") {
    exportCurrentViewPdf();
    setMonitorMessage("F12 genero el PDF del monitor actual.");
  }
}

function openMonitorDrawing(piezaId) {
  const pieza = selectedMonitorPiece();
  if (!pieza) {
    setMonitorMessage(`No se encontro detalle de la pieza ${piezaId}.`, "error");
    return;
  }
  if (pieza.archivo) {
    const archivo = String(pieza.archivo);
    const href = /^(https?:)?\/\//.test(archivo) || archivo.startsWith("/") ? archivo : `/${archivo.replace(/^\/+/, "")}`;
    window.open(href, "_blank", "noopener");
    setMonitorMessage(`F2 abrio el dibujo de la pieza ${piezaId}.`);
    return;
  }
  const dibujo = pieza.noDibujo ? ` Dibujo registrado: ${pieza.noDibujo}.` : "";
  setMonitorMessage(`La pieza ${piezaId} no tiene archivo de dibujo cargado.${dibujo}`, "warning");
}

function setMonitorMessage(message, tone = "") {
  const target = root.querySelector("#monitor-shortcut-message");
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("warning-message", tone === "warning");
  target.classList.toggle("error-message", tone === "error");
}

async function openStatusPanel(piezaId, options = {}) {
  const pieza = cache.piezas.find(item => item.id === piezaId);
  const notas = await api(`/api/piezas/${piezaId}/notas`);
  const panel = document.querySelector("#status-panel");
  panel.hidden = false;
  panel.innerHTML = `
    <form class="form-grid" id="status-form">
      <div class="wide">
        <strong>Pieza ${piezaId}</strong>
        <p class="muted">${escapeHtml(pieza?.descripcion || "")}</p>
      </div>
      <label>Estatus<select name="estatusId" required>${options(cache.estatus, "id", "descripcion", pieza?.estatusId)}</select></label>
      <label class="wide">Nota<textarea name="nota" placeholder="Agregar nota visible en reportes y seguimiento"></textarea></label>
      <div class="wide split-actions">
        <button>Guardar estatus</button>
        <button class="secondary" type="button" id="status-cancel">Cerrar</button>
      </div>
    </form>
    ${table(["Fecha", "Estatus", "Usuario", "Nota"], notas.map(n => [
      formatDateTime(n.createdAt),
      n.estatus || "",
      n.usuario || "",
      escapeHtml(n.nota)
    ]))}`;
  panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
  if (options.focusNote) {
    document.querySelector("#status-form textarea[name='nota']")?.focus();
  }
  document.querySelector("#status-cancel").addEventListener("click", () => {
    panel.hidden = true;
    panel.innerHTML = "";
  });
  document.querySelector("#status-form").addEventListener("submit", async event => {
    event.preventDefault();
    const data = normalize(formData(event.currentTarget));
    await api(`/api/piezas/${piezaId}/estatus`, { method: "PUT", body: JSON.stringify(data) });
    await navigate("monitor");
  });
}

async function renderTiempos() {
  await loadReferenceData();
  const rows = await api("/api/tiempos");
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000).toISOString().slice(0, 16);
  const end = now.toISOString().slice(0, 16);
  root.innerHTML = `
    <div class="panel">
      <form class="form-grid" id="tiempo-form">
        <label>Pieza<select name="piezaId" required>${options(cache.piezas, "id", "descripcion")}</select></label>
        <label>Operador<select name="operadorId" required>${options(cache.operadores, "id", "nombreOperador")}</select></label>
        <label>Estatus<select name="estatusId" required>${options(cache.estatus, "id", "descripcion")}</select></label>
        <label>Inicio<input name="inicio" type="datetime-local" value="${start}" required></label>
        <label>Fin<input name="fin" type="datetime-local" value="${end}" required></label>
        <label class="wide">Operacion
          <input name="descripcionOperacion" list="actividades-oficiales" required value="${escapeHtml(OFFICIAL_ACTIVITIES[0].name)}">
          <datalist id="actividades-oficiales">
            ${OFFICIAL_ACTIVITIES.map(activity => `<option value="${escapeHtml(activity.name)}">${escapeHtml(activity.description)}</option>`).join("")}
          </datalist>
        </label>
        <div class="activity-hint wide">
          <strong>${escapeHtml(OFFICIAL_ACTIVITIES[0].name)}</strong>
          <span>${escapeHtml(OFFICIAL_ACTIVITIES[0].description)}</span>
        </div>
        <button>Capturar tiempo</button>
      </form>
    </div>
    ${table(["ID", "Pieza", "Operador", "Operacion", "Inicio", "Fin", "Min."], rows.map(t => [t.id, t.piezaDescripcion, t.operadorNombre, t.descripcionOperacion, t.inicio, t.fin, t.minutos]))}`;
  document.querySelector("#tiempo-form").addEventListener("submit", submitJson("/api/tiempos", () => navigate("tiempos")));
}

async function renderRequisiciones() {
  await loadReferenceData();
  const [rows, materialOptions] = await Promise.all([
    api("/api/requisiciones"),
    api("/api/requisiciones/material-opciones")
  ]);
  requisicionMaterialOptions = materialOptions;
  requisicionPartidas = [];
  selectedRequisicionPartidaIndex = null;
  root.innerHTML = `
    <datalist id="req-material-options">${requisitionMaterialOptionsHtml()}</datalist>
    <datalist id="req-description-options">${requisitionDescriptionOptionsHtml()}</datalist>
    <div class="panel requisition-panel">
      <div class="panel-title-row">
        <h3>Requisicion de material</h3>
        <span class="muted">F3 elimina la partida seleccionada</span>
      </div>
      <form class="requisition-form" id="req-form">
        <section class="requisition-entry">
          <label>ID Pieza<select name="piezaId" required>${cache.piezas.map(piezaRequisicionOption).join("")}</select></label>
          <label>Destino<input name="destino" value="${GODMISA_INTERNAL_DESTINO}" required></label>
          <label>Material<input name="material" list="req-material-options" placeholder="ACERO, NYLON"></label>
          <label>Medida<select name="unidadMedida">${MEDIDAS_REQUISICION.map(medida => `<option value="${medida}"${medida === "PIEZAS" ? " selected" : ""}>${medida}</option>`).join("")}</select></label>
          <label>Cantidad<input name="cantidad" type="number" step="0.001" value="1" min="0.001"></label>
          <label class="wide">Descripcion<input name="descripcion" list="req-description-options" placeholder="Selecciona o captura la descripcion del material"></label>
          <button class="secondary" type="button" id="req-add-part">Agregar partida</button>
        </section>
        <div id="req-parts-container">${requisitionPartsTable()}</div>
        <section class="requisition-footer">
          <label>Nombre solicitante<input name="solicitante" required></label>
          <label>Autorizado por<input name="autorizacion"></label>
          <fieldset class="priority-choice">
            <legend>Prioridad</legend>
            <label><input type="radio" name="prioridad" value="Normal" checked> Normal</label>
            <label><input type="radio" name="prioridad" value="Urgente"> Urgente</label>
          </fieldset>
          <label class="wide">Observaciones<textarea name="observaciones"></textarea></label>
        </section>
        <div class="split-actions">
          <button>Generar requisicion</button>
          <button class="secondary" type="button" id="req-clear-parts">Limpiar partidas</button>
          <span class="toolbar-status" id="req-message" role="status"></span>
        </div>
      </form>
    </div>
    ${table(["Folio", "Solicitante", "Prioridad", "Fecha", "Partidas", "ID Pieza", "Material", "Detalle"], rows.map(r => [
      r.folio,
      r.solicitante,
      r.prioridad,
      formatDateTime(r.fecha),
      r.detalles?.length || 0,
      r.detalles?.[0]?.piezaId || "",
      r.detalles?.[0]?.material || "",
      requisicionDetalleResumen(r.detalles)
    ]))}`;
  const form = document.querySelector("#req-form");
  form.piezaId.addEventListener("change", () => updateRequisitionDestination(form));
  form.material.addEventListener("input", () => updateRequisitionDescriptionOptions(form.material.value));
  form.descripcion.addEventListener("change", () => applyRequisitionDescriptionSelection(form));
  form.descripcion.addEventListener("input", () => applyRequisitionDescriptionSelection(form));
  document.querySelector("#req-add-part").addEventListener("click", () => appendCurrentRequisicionPartida(form));
  document.querySelector("#req-clear-parts").addEventListener("click", () => {
    requisicionPartidas = [];
    selectedRequisicionPartidaIndex = null;
    updateRequisitionPartsTable();
    setRequisitionMessage("Partidas limpiadas.");
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!requisicionPartidas.length) {
      setRequisitionMessage("Agrega al menos una partida antes de generar la requisicion.", "error");
      return;
    }
    const data = formData(form);
    const payload = {
      solicitante: data.solicitante,
      prioridad: data.prioridad,
      autorizacion: data.autorizacion,
      observaciones: data.observaciones,
      detalles: requisicionPartidas.map(partida => ({ ...partida }))
    };
    const created = await api("/api/requisiciones", { method: "POST", body: JSON.stringify(payload) });
    const shouldPrint = window.confirm(`Se agrego la requisicion con el folio: ${created.folio}\nDesea imprimir la requisicion?`);
    if (shouldPrint) {
      const blob = await api(`/api/requisiciones/${created.folio}/pdf`);
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    }
    await navigate("requisiciones");
  });
  updateRequisitionDestination(form);
  bindRequisitionPartRows();
}

function piezaRequisicionOption(pieza) {
  const cliente = pieza.clienteNombre || "GODMISA";
  const oc = pieza.ordenCompra ? `OC ${pieza.ordenCompra}` : "Sin OC";
  return `<option value="${pieza.id}">${escapeHtml(`${pieza.id} | ${cliente} | ${oc} | ${pieza.descripcion}`)}</option>`;
}

function requisitionMaterialOptionsHtml() {
  const materials = [...new Set(requisicionMaterialOptions.map(option => option.material).filter(Boolean))];
  return materials.map(material => `<option value="${escapeHtml(material)}"></option>`).join("");
}

function requisitionDescriptionOptionsHtml(materialFilter = "") {
  const material = normalizeLookup(materialFilter);
  const options = requisicionMaterialOptions
    .filter(option => !material || normalizeLookup(option.material).includes(material))
    .map(option => `<option value="${escapeHtml(option.descripcion)}" data-material="${escapeHtml(option.material)}"></option>`);
  return options.join("");
}

function updateRequisitionDescriptionOptions(materialFilter) {
  const datalist = document.querySelector("#req-description-options");
  if (datalist) datalist.innerHTML = requisitionDescriptionOptionsHtml(materialFilter);
}

function applyRequisitionDescriptionSelection(form) {
  const option = requisicionMaterialOptions.find(item => normalizeLookup(item.descripcion) === normalizeLookup(form.descripcion.value));
  if (!option) return;
  form.material.value = option.material || form.material.value;
  form.unidadMedida.value = option.unidadMedida || form.unidadMedida.value;
  updateRequisitionDescriptionOptions(form.material.value);
}

function updateRequisitionDestination(form) {
  const pieza = cache.piezas.find(item => String(item.id) === String(form.piezaId.value));
  if (!pieza) return;
  form.destino.value = Number(pieza.id) === GODMISA_INTERNAL_PIEZA_ID
    ? GODMISA_INTERNAL_DESTINO
    : (pieza.clienteNombre || form.destino.value || GODMISA_INTERNAL_DESTINO);
}

function appendCurrentRequisicionPartida(form) {
  applyRequisitionDescriptionSelection(form);
  const data = formData(form);
  const cantidad = Number(data.cantidad);
  const descripcion = String(data.descripcion || "").trim();
  if (!descripcion) {
    setRequisitionMessage("Captura o selecciona una descripcion de material.", "error");
    form.descripcion.focus();
    return;
  }
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    setRequisitionMessage("La cantidad debe ser mayor a cero.", "error");
    form.cantidad.focus();
    return;
  }
  requisicionPartidas.push({
    piezaId: Number(data.piezaId),
    cantidad,
    descripcion,
    destino: data.destino,
    material: data.material,
    unidadMedida: data.unidadMedida
  });
  selectedRequisicionPartidaIndex = requisicionPartidas.length - 1;
  updateRequisitionPartsTable();
  setRequisitionMessage(`Partida ${requisicionPartidas.length} agregada.`);
  form.descripcion.value = "";
  form.cantidad.value = "1";
  form.descripcion.focus();
}

function requisitionPartsTable() {
  if (!requisicionPartidas.length) {
    return `<div class="table-wrap empty-state">Sin partidas agregadas</div>`;
  }
  const headers = ["#", "ID Pieza", "Destino", "Material", "Medida", "Cantidad", "Descripcion"];
  const safeHeaders = headers.map(header => escapeHtml(header));
  return `
    <div class="table-wrap">
      <table class="requisition-parts-table">
        <thead><tr>${safeHeaders.map(header => `<th>${header}</th>`).join("")}</tr></thead>
        <tbody>${requisicionPartidas.map((partida, index) => `
          <tr class="requisition-part-row${index === selectedRequisicionPartidaIndex ? " is-selected" : ""}" data-index="${index}" tabindex="0" aria-selected="${index === selectedRequisicionPartidaIndex ? "true" : "false"}">
            <td data-label="#">${index + 1}</td>
            <td data-label="ID Pieza">${partida.piezaId}</td>
            <td data-label="Destino">${escapeHtml(partida.destino || "")}</td>
            <td data-label="Material">${escapeHtml(partida.material || "")}</td>
            <td data-label="Medida">${escapeHtml(partida.unidadMedida || "")}</td>
            <td data-label="Cantidad">${partida.cantidad}</td>
            <td data-label="Descripcion">${escapeHtml(partida.descripcion || "")}</td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function updateRequisitionPartsTable() {
  const container = document.querySelector("#req-parts-container");
  if (!container) return;
  container.innerHTML = requisitionPartsTable();
  bindRequisitionPartRows();
}

function bindRequisitionPartRows() {
  root.querySelectorAll(".requisition-part-row").forEach(row => {
    row.addEventListener("click", () => selectRequisitionPartida(Number(row.dataset.index)));
    row.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectRequisitionPartida(Number(row.dataset.index));
      }
    });
  });
}

function selectRequisitionPartida(index) {
  selectedRequisicionPartidaIndex = index;
  root.querySelectorAll(".requisition-part-row").forEach(row => {
    const selected = Number(row.dataset.index) === index;
    row.classList.toggle("is-selected", selected);
    row.setAttribute("aria-selected", String(selected));
  });
}

function removeSelectedRequisicionPartida() {
  if (currentViewName !== "requisiciones") return;
  if (selectedRequisicionPartidaIndex == null || !requisicionPartidas[selectedRequisicionPartidaIndex]) {
    setRequisitionMessage("Selecciona una partida para eliminar con F3.", "error");
    return;
  }
  requisicionPartidas.splice(selectedRequisicionPartidaIndex, 1);
  selectedRequisicionPartidaIndex = requisicionPartidas.length ? Math.min(selectedRequisicionPartidaIndex, requisicionPartidas.length - 1) : null;
  updateRequisitionPartsTable();
  setRequisitionMessage("Partida eliminada.");
}

function setRequisitionMessage(message, tone = "") {
  const target = document.querySelector("#req-message");
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("error-message", tone === "error");
}

function requisicionDetalleResumen(detalles = []) {
  return detalles.map(detalle => `${detalle.cantidad} ${detalle.unidadMedida || ""} ${detalle.descripcion || ""}`).join(" | ");
}

async function renderOrdenesCompra() {
  await loadReferenceData();
  const [requisiciones, ordenesCompra] = await Promise.all([
    api("/api/requisiciones"),
    api("/api/ordenes-compra")
  ]);
  const partidas = requisiciones
    .filter(r => !r.cancelado && !r.surtido)
    .flatMap(r => (r.detalles || []).map(d => ({
      ...d,
      requisicionFolio: r.folio,
      solicitante: r.solicitante,
      enviadaACompras: r.enviadaACompras
    })));
  root.innerHTML = `
    <form class="panel form-grid" id="oc-form">
      <label>Proveedor<select name="proveedorId" required>${proveedorOptions(cache.proveedores)}</select></label>
      <label>Moneda<select name="moneda"><option>Moneda Nacional</option><option>USD</option></select></label>
      <label>Ret. IVA %<input name="retencionIvaPct" type="number" step="0.0001" value="0"></label>
      <label>Ret. ISR %<input name="retencionIsrPct" type="number" step="0.0001" value="0"></label>
      <label class="wide">Observaciones<input name="observaciones"></label>
      <div class="wide">
        ${table(["Sel.", "Req.", "ID Pieza", "Solicitante", "Descripcion", "Cant.", "Unidad", "Destino", "Precio"], partidas.map(d => [
          `<input class="oc-select" type="checkbox" value="${d.id}">`,
          d.requisicionFolio,
          d.piezaId || "",
          d.solicitante,
          d.descripcion,
          d.cantidad,
          d.unidadMedida || "",
          d.destino || "",
          `<input class="inline-input oc-price" data-price-id="${d.id}" type="number" step="0.01" value="${d.precio || 0}">`
        ]))}
      </div>
      <div class="wide split-actions">
        <button ${cache.proveedores.length && partidas.length ? "" : "disabled"}>Generar orden de compra</button>
        <button class="secondary" type="button" data-go="proveedores">Alta proveedor</button>
      </div>
    </form>
    ${table(["Folio", "Proveedor", "Fecha", "Subtotal", "IVA", "Retenciones", "Total neto", "Documentos"], ordenesCompra.map(o => [
      o.folio,
      o.proveedorNombre,
      formatDateTime(o.fecha),
      formatMoney(o.subtotal),
      formatMoney(o.iva),
      formatMoney((Number(o.retencionIva) || 0) + (Number(o.retencionIsr) || 0)),
      formatMoney(o.total),
      `<div class="split-actions compact-actions">
        <button class="secondary oc-pdf-button" data-pdf-id="${o.id}">PDF</button>
        <button class="secondary oc-word-button" data-word-id="${o.id}" data-word-folio="${escapeHtml(o.folio)}">Word</button>
      </div>`
    ]))}`;
  document.querySelector("[data-go='proveedores']").addEventListener("click", () => navigate("proveedores"));
  const form = document.querySelector("#oc-form");
  applyProveedorRetenciones(form);
  form.proveedorId.addEventListener("change", () => applyProveedorRetenciones(form));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const selected = [...document.querySelectorAll(".oc-select:checked")].map(input => {
      const partida = partidas.find(item => String(item.id) === input.value);
      const price = document.querySelector(`.oc-price[data-price-id="${input.value}"]`).value;
      return {
        requisicionDetalleId: partida.id,
        requisicionFolio: partida.requisicionFolio,
        cantidad: Number(partida.cantidad),
        descripcion: partida.descripcion,
        destino: partida.destino,
        material: partida.material,
        unidadMedida: partida.unidadMedida,
        precioUnitario: Number(price || 0)
      };
    });
    if (!selected.length) return;
    const data = normalize(formData(form));
    await api("/api/ordenes-compra", {
      method: "POST",
      body: JSON.stringify({ ...data, detalles: selected })
    });
    await navigate("ordenesCompra");
  });
  document.querySelectorAll(".oc-pdf-button").forEach(button => {
    button.addEventListener("click", async () => {
      const blob = await api(`/api/ordenes-compra/${button.dataset.pdfId}/pdf`);
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    });
  });
  document.querySelectorAll(".oc-word-button").forEach(button => {
    button.addEventListener("click", async () => {
      const blob = await api(`/api/ordenes-compra/${button.dataset.wordId}/word`);
      downloadBlob(blob, `${button.dataset.wordFolio || "orden-compra"}.rtf`);
    });
  });
}

async function renderAlmacen() {
  await loadReferenceData();
  const kardex = await api("/api/almacen/kardex");
  root.innerHTML = `
    <div class="grid-2">
      <form class="panel form-grid" id="articulo-form">
        <label>Articulo<input name="descripcion" required></label>
        <label>Medida<input name="medida" value="pieza"></label>
        <label>Existencia<input name="existencia" type="number" step="0.001" value="0"></label>
        <label>Minimo<input name="minimo" type="number" value="0"></label>
        <label>Maximo<input name="maximo" type="number" value="0"></label>
        <label>Punto reorden<input name="puntoReorden" type="number" value="0"></label>
        <input type="hidden" name="activo" value="true">
        <button>Guardar articulo</button>
      </form>
      <form class="panel form-grid" id="mov-form">
        <label>Articulo<select name="articuloId" required>${options(cache.articulos, "id", "descripcion")}</select></label>
        <label>Tipo<select name="tipo"><option value="entradas">Entrada</option><option value="salidas">Salida</option></select></label>
        <label>Cantidad<input name="cantidad" type="number" step="0.001" value="1"></label>
        <label>Precio unitario<input name="precioUnitario" type="number" step="0.01" value="0"></label>
        <label class="wide">Observaciones<input name="observaciones"></label>
        <button>Registrar movimiento</button>
      </form>
    </div>
    ${table(["ID", "Articulo", "Existencia", "Reorden"], cache.articulos.map(a => [a.id, a.descripcion, a.existencia, a.puntoReorden]))}
    ${table(["ID", "Articulo", "Tipo", "Cantidad", "Fecha"], kardex.map(k => [k.id, k.articuloDescripcion, k.tipo, k.cantidad, k.fecha]))}`;
  document.querySelector("#articulo-form").addEventListener("submit", submitJson("/api/almacen/articulos", () => navigate("almacen")));
  document.querySelector("#mov-form").addEventListener("submit", async event => {
    event.preventDefault();
    const data = formData(event.currentTarget);
    const tipo = data.tipo;
    delete data.tipo;
    await api(`/api/almacen/${tipo}`, { method: "POST", body: JSON.stringify(data) });
    await navigate("almacen");
  });
}

async function renderRemisiones() {
  await loadReferenceData();
  const rows = await api("/api/remisiones");
  const pendientes = cache.piezas.filter(p => !p.entregado && p.id !== GODMISA_INTERNAL_PIEZA_ID);
  root.innerHTML = `
    <div class="grid-2">
      <form class="panel form-grid" id="rem-form">
        <label class="wide">Buscar pieza<input id="rem-search" placeholder="Cliente, OC, no. parte, no. dibujo o descripcion"></label>
        <label class="wide">Pieza<select name="piezaId" required>${pendientes.map(piezaRemisionOption).join("")}</select></label>
        <label>Cantidad entregada<input name="cantidadEntregada" type="number" min="1" value="1"></label>
        <label>Chofer<input name="chofer"></label>
        <label>Autorizacion<input name="autorizacion"></label>
        <p class="wide muted" id="rem-piece-summary"></p>
        <label class="wide">Observaciones<textarea name="observaciones"></textarea></label>
        <button>Generar remision</button>
      </form>
      <div id="rem-search-results">
        ${renderRemisionSearchTable(pendientes)}
      </div>
    </div>
    ${table(["ID", "Folio", "Cliente", "Pieza", "Cantidad", "PDF"], rows.map(r => [r.id, r.folio, r.clienteNombre, r.piezaId, r.cantidadEntregada, `<button class="secondary pdf-button" data-pdf-id="${r.id}">Abrir PDF</button>`]))}`;
  document.querySelector("#rem-form").addEventListener("submit", submitJson("/api/remisiones", () => navigate("remisiones")));
  const form = document.querySelector("#rem-form");
  const search = document.querySelector("#rem-search");
  const results = document.querySelector("#rem-search-results");
  const requestedPieza = pendientes.find(p => Number(p.id) === Number(pendingRemisionPiezaId));
  if (requestedPieza) {
    form.piezaId.value = String(requestedPieza.id);
    search.value = requestedPieza.noParte || requestedPieza.noDibujo || String(requestedPieza.id);
    results.innerHTML = renderRemisionSearchTable([requestedPieza]);
    form.cantidadEntregada?.focus();
  }
  pendingRemisionPiezaId = null;
  const updateSummary = () => {
    const pieza = pendientes.find(p => String(p.id) === String(form.piezaId.value));
    document.querySelector("#rem-piece-summary").textContent = pieza
      ? `${pieza.clienteNombre} | OC ${pieza.ordenCompra} | ${pieza.noParte || "Sin no. parte"} | pendiente ${pieza.cantidad - pieza.cantidadEntregada}`
      : "Sin pieza seleccionada";
  };
  form.piezaId.addEventListener("change", updateSummary);
  search.addEventListener("input", () => {
    const filtered = filterPiezas(pendientes, search.value);
    results.innerHTML = renderRemisionSearchTable(filtered);
    bindRemisionPickers(form, updateSummary);
  });
  bindRemisionPickers(form, updateSummary);
  updateSummary();
  document.querySelectorAll(".pdf-button").forEach(button => {
    button.addEventListener("click", async () => {
      const blob = await api(`/api/remisiones/${button.dataset.pdfId}/pdf`);
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    });
  });
}

function renderRemisionSearchTable(piezas) {
  return table(["Pieza", "Cliente", "OC", "No. parte", "Pendiente", ""], piezas.map(p => [
    p.id,
    p.clienteNombre,
    p.ordenCompra,
    p.noParte || "",
    p.cantidad - p.cantidadEntregada,
    `<button class="secondary rem-pick" data-pieza-id="${p.id}">Usar</button>`
  ]));
}

function bindRemisionPickers(form, updateSummary) {
  document.querySelectorAll(".rem-pick").forEach(button => {
    button.addEventListener("click", () => {
      form.piezaId.value = button.dataset.piezaId;
      updateSummary();
    });
  });
}

async function renderReportes() {
  await loadReferenceData();
  const [requisiciones, ordenesCompra, tiempos, remisiones] = await Promise.all([
    api("/api/requisiciones"),
    api("/api/ordenes-compra"),
    api("/api/tiempos"),
    api("/api/remisiones")
  ]);
  root.innerHTML = `
    <section class="report-layout">
      <aside class="panel report-options">
        <h3>Reportes</h3>
        <div class="report-option-list">
          ${REPORT_OPTIONS.map(reportOptionButton).join("")}
        </div>
      </aside>
      <section class="report-main">
        <form class="panel form-grid" id="report-filter-form">
          <label>Buscar<input name="q" placeholder="OC, cliente, no. parte, dibujo, descripcion"></label>
          <label>Cliente<select name="clienteId"><option value="">Todos</option>${options(cache.clientes, "id", "nombreCliente")}</select></label>
          <label>Operador<select name="operadorId"><option value="">Todos</option>${options(cache.operadores, "id", "nombreOperador")}</select></label>
          <label>Estatus<select name="estatusId"><option value="">Todos</option>${options(cache.estatus, "id", "descripcion")}</select></label>
          <label>Desde<input name="desde" type="date"></label>
          <label>Hasta<input name="hasta" type="date"></label>
          <div class="wide split-actions">
            <button>Aplicar filtros</button>
            <button class="secondary" type="button" id="report-clear">Limpiar</button>
          </div>
        </form>
        <div id="report-output" class="report-output"></div>
      </section>
    </section>`;
  const form = document.querySelector("#report-filter-form");
  const context = { piezas: cache.piezas, requisiciones, ordenesCompra, tiempos, remisiones };
  const draw = () => {
    const filters = formData(form);
    document.querySelector("#report-output").innerHTML = renderReportContent(selectedReportId, context, filters);
    updateReportSelection();
  };
  form.addEventListener("submit", event => {
    event.preventDefault();
    draw();
  });
  document.querySelector("#report-clear").addEventListener("click", () => {
    form.reset();
    draw();
  });
  document.querySelectorAll(".report-option").forEach(button => {
    button.addEventListener("click", () => {
      selectedReportId = button.dataset.reportId;
      draw();
    });
  });
  draw();
}

function reportOptionButton(option) {
  const active = option.id === selectedReportId ? " is-active" : "";
  return `
    <button class="report-option${active}" type="button" data-report-id="${option.id}">
      <span class="report-option-mark">${escapeHtml(option.label.slice(0, 2).toUpperCase())}</span>
      <span>
        <strong>${escapeHtml(option.label)}</strong>
        <small>${escapeHtml(option.detail)}</small>
      </span>
    </button>`;
}

function updateReportSelection() {
  document.querySelectorAll(".report-option").forEach(button => {
    button.classList.toggle("is-active", button.dataset.reportId === selectedReportId);
  });
}

function renderReportContent(reportId, context, filters) {
  const data = filteredReportData(context, filters);
  const option = REPORT_OPTIONS.find(item => item.id === reportId) || REPORT_OPTIONS[0];
  if (option.id === "busquedaPiezas") return renderBusquedaPiezas(option, data);
  if (option.id === "piezasFechas") return renderPiezasFechas(option, data);
  if (option.id === "piezasVencer") return renderPiezasVencer(option, data);
  if (option.id === "tiemposOperador") return renderTiemposOperador(option, data);
  if (option.id === "piezasEntregadas") return renderPiezasEntregadas(option, data);
  if (option.id === "estimacionSemanal") return renderEstimacionSemanal(option, data);
  if (option.id === "embarques") return renderEmbarques(option, data);
  if (option.id === "estadisticas") return renderEstadisticas(option, data);
  if (option.id === "impresionFactura") return renderImpresionFactura(option, data);
  if (option.id === "facturasGeneradas") return renderFacturasGeneradas(option, data);
  return renderDiarioOperador(option, data);
}

function filteredReportData(context, filters) {
  const piezaMap = new Map(context.piezas.map(pieza => [String(pieza.id), pieza]));
  const requisiciones = context.requisiciones
    .filter(req => reportMatches([
      req.folio,
      req.solicitante,
      req.prioridad,
      ...(req.detalles || []).flatMap(detalle => [detalle.piezaId, detalle.descripcion, detalle.material, detalle.destino])
    ], filters.q))
    .filter(req => inDateRange(reportDate(req.fecha), filters.desde, filters.hasta));
  const piezas = context.piezas
    .filter(pieza => filterPiezas([pieza], filters.q).length)
    .filter(pieza => !filters.clienteId || String(pieza.clienteId) === filters.clienteId)
    .filter(pieza => !filters.estatusId || String(pieza.estatusId) === filters.estatusId)
    .filter(pieza => inDateRange(pieza.fechaCompromiso, filters.desde, filters.hasta));
  const tiempos = context.tiempos
    .filter(tiempo => reportMatches([
      tiempo.piezaId,
      tiempo.piezaDescripcion,
      tiempo.operadorNombre,
      tiempo.descripcionOperacion,
      tiempo.estatus
    ], filters.q))
    .filter(tiempo => !filters.operadorId || String(tiempo.operadorId) === filters.operadorId)
    .filter(tiempo => !filters.estatusId || String(tiempo.estatusId) === filters.estatusId)
    .filter(tiempo => inDateRange(reportDate(tiempo.inicio), filters.desde, filters.hasta));
  const remisiones = context.remisiones
    .filter(remision => {
      const pieza = piezaMap.get(String(remision.piezaId));
      return reportMatches([remision.folio, remision.clienteNombre, remision.piezaId, remision.chofer, pieza?.descripcion], filters.q);
    })
    .filter(remision => !filters.clienteId || String(remision.clienteId) === filters.clienteId)
    .filter(remision => {
      if (!filters.estatusId) return true;
      const pieza = piezaMap.get(String(remision.piezaId));
      return pieza && String(pieza.estatusId) === filters.estatusId;
    })
    .filter(remision => inDateRange(reportDate(remision.fecha), filters.desde, filters.hasta));
  const ordenesCompra = context.ordenesCompra
    .filter(orden => reportMatches([
      orden.folio,
      orden.proveedorNombre,
      orden.moneda,
      ...(orden.detalles || []).flatMap(detalle => [detalle.requisicionFolio, detalle.descripcion, detalle.material, detalle.destino])
    ], filters.q))
    .filter(orden => inDateRange(reportDate(orden.fecha), filters.desde, filters.hasta));
  return { piezas, requisiciones, ordenesCompra, tiempos, remisiones, piezaMap };
}

function renderDiarioOperador(option, data) {
  const totalMinutos = sumReport(data.tiempos, tiempo => tiempo.minutos);
  return reportFrame(option, [
    metric("Registros", data.tiempos.length),
    metric("Operadores", uniqueCount(data.tiempos, tiempo => tiempo.operadorId)),
    metric("Minutos", totalMinutos)
  ], `
    <section class="panel">
      <h3>Detalle diario</h3>
      ${table(["Fecha", "Operador", "Pieza", "Descripcion", "Operacion", "Estatus", "Min."], data.tiempos.map(tiempo => [
        formatDateOnly(reportDate(tiempo.inicio)),
        reportText(tiempo.operadorNombre),
        tiempo.piezaId,
        reportText(tiempo.piezaDescripcion),
        reportText(tiempo.descripcionOperacion),
        reportText(tiempo.estatus),
        tiempo.minutos || 0
      ]))}
    </section>`);
}

function renderBusquedaPiezas(option, data) {
  return reportFrame(option, [
    metric("Piezas", data.piezas.length),
    metric("Entregadas", data.piezas.filter(pieza => pieza.entregado).length),
    metric("Pendientes", data.piezas.filter(pieza => !pieza.entregado).length)
  ], `
    <section class="panel">
      <h3>Resultado de busqueda</h3>
      ${reportPiecesTable(data.piezas)}
    </section>`);
}

function renderPiezasFechas(option, data) {
  const rows = [...data.piezas].sort((a, b) => String(a.fechaCompromiso || "").localeCompare(String(b.fechaCompromiso || "")));
  return reportFrame(option, [
    metric("Piezas", rows.length),
    metric("Clientes", uniqueCount(rows, pieza => pieza.clienteId)),
    metric("Cantidad", sumReport(rows, pieza => pieza.cantidad))
  ], `
    <section class="panel">
      <h3>Piezas por fechas</h3>
      ${table(["Pieza", "Cliente", "OC", "Requerimiento", "Compromiso", "Dias", "Estatus", "Descripcion"], rows.map(pieza => [
        pieza.id,
        reportText(pieza.clienteNombre),
        reportText(pieza.ordenCompra),
        formatDateOnly(pieza.fechaRequerimiento),
        formatDateOnly(pieza.fechaCompromiso),
        dueBadge(daysUntil(pieza.fechaCompromiso)),
        reportText(pieza.estatus),
        reportText(pieza.descripcion)
      ]))}
    </section>`);
}

function renderPiezasVencer(option, data) {
  const rows = data.piezas
    .filter(pieza => !pieza.entregado)
    .map(pieza => ({ pieza, dias: daysUntil(pieza.fechaCompromiso) }))
    .filter(item => item.dias <= 7)
    .sort((a, b) => a.dias - b.dias);
  return reportFrame(option, [
    metric("Por vencer", rows.filter(item => item.dias >= 0).length),
    metric("Vencidas", rows.filter(item => item.dias < 0).length),
    metric("Cantidad pendiente", sumReport(rows, item => Number(item.pieza.cantidad || 0) - Number(item.pieza.cantidadEntregada || 0)))
  ], `
    <section class="panel">
      <h3>Piezas por vencer</h3>
      ${table(["Pieza", "Cliente", "OC", "Compromiso", "Dias", "Pendiente", "Estatus", "Descripcion"], rows.map(({ pieza, dias }) => [
        pieza.id,
        reportText(pieza.clienteNombre),
        reportText(pieza.ordenCompra),
        formatDateOnly(pieza.fechaCompromiso),
        dueBadge(dias),
        Math.max(0, Number(pieza.cantidad || 0) - Number(pieza.cantidadEntregada || 0)),
        reportText(pieza.estatus),
        reportText(pieza.descripcion)
      ]))}
    </section>`);
}

function renderTiemposOperador(option, data) {
  const rows = reportOperatorTotals(data.tiempos);
  return reportFrame(option, [
    metric("Operadores", rows.length),
    metric("Registros", data.tiempos.length),
    metric("Minutos", sumReport(data.tiempos, tiempo => tiempo.minutos))
  ], `
    <section class="panel">
      <h3>Tiempos por operador</h3>
      ${table(["Operador", "Registros", "Piezas", "Minutos", "Horas"], rows.map(row => [
        reportText(row.operador),
        row.registros,
        row.piezas.size,
        row.minutos,
        (row.minutos / 60).toFixed(2)
      ]))}
    </section>`);
}

function renderPiezasEntregadas(option, data) {
  const rows = data.piezas
    .filter(pieza => pieza.entregado || Number(pieza.cantidadEntregada || 0) > 0)
    .sort((a, b) => String(a.clienteNombre || "").localeCompare(String(b.clienteNombre || "")));
  return reportFrame(option, [
    metric("Piezas con entrega", rows.length),
    metric("Remisiones", data.remisiones.length),
    metric("Cantidad entregada", sumReport(rows, pieza => pieza.cantidadEntregada))
  ], `
    <section class="panel">
      <h3>Piezas entregadas</h3>
      ${table(["Pieza", "Cliente", "OC", "Cant.", "Entregada", "Compromiso", "Estatus", "Descripcion"], rows.map(pieza => [
        pieza.id,
        reportText(pieza.clienteNombre),
        reportText(pieza.ordenCompra),
        pieza.cantidad,
        pieza.cantidadEntregada || 0,
        formatDateOnly(pieza.fechaCompromiso),
        reportText(pieza.estatus),
        reportText(pieza.descripcion)
      ]))}
    </section>`);
}

function renderEstimacionSemanal(option, data) {
  const rows = data.piezas
    .filter(pieza => !pieza.entregado)
    .map(pieza => ({ pieza, dias: daysUntil(pieza.fechaCompromiso) }))
    .filter(item => item.dias >= 0 && item.dias <= 7)
    .sort((a, b) => a.dias - b.dias);
  return reportFrame(option, [
    metric("Piezas semana", rows.length),
    metric("Clientes", uniqueCount(rows, item => item.pieza.clienteId)),
    metric("Cantidad", sumReport(rows, item => item.pieza.cantidad))
  ], `
    <section class="panel">
      <h3>Estimacion semanal</h3>
      ${table(["Compromiso", "Dias", "Pieza", "Cliente", "Cantidad", "Estatus", "Descripcion"], rows.map(({ pieza, dias }) => [
        formatDateOnly(pieza.fechaCompromiso),
        dueBadge(dias),
        pieza.id,
        reportText(pieza.clienteNombre),
        pieza.cantidad,
        reportText(pieza.estatus),
        reportText(pieza.descripcion)
      ]))}
    </section>`);
}

function renderEmbarques(option, data) {
  return reportFrame(option, [
    metric("Remisiones", data.remisiones.length),
    metric("Clientes", uniqueCount(data.remisiones, remision => remision.clienteId)),
    metric("Cantidad", sumReport(data.remisiones, remision => remision.cantidadEntregada))
  ], `
    <section class="panel">
      <h3>Embarques</h3>
      ${table(["Folio", "Fecha", "Cliente", "Pieza", "Cantidad", "Chofer", "Autorizacion", "Activo"], data.remisiones.map(remision => [
        reportText(remision.folio),
        formatDateTime(remision.fecha),
        reportText(remision.clienteNombre),
        remision.piezaId,
        remision.cantidadEntregada,
        reportText(remision.chofer),
        reportText(remision.autorizacion),
        yesNo(remision.activo)
      ]))}
    </section>`);
}

function renderEstadisticas(option, data) {
  const statusRows = reportTotalsBy(data.piezas, pieza => pieza.estatus || "Sin estatus");
  const clientRows = reportTotalsBy(data.piezas, pieza => pieza.clienteNombre || "Sin cliente");
  return reportFrame(option, [
    metric("Piezas", data.piezas.length),
    metric("Requisiciones", data.requisiciones.length),
    metric("Ordenes compra", data.ordenesCompra.length),
    metric("Remisiones", data.remisiones.length)
  ], `
    <section class="grid-2">
      <div class="panel">
        <h3>Por estatus</h3>
        ${table(["Estatus", "Piezas", "Cantidad"], statusRows.map(row => [reportText(row.label), row.count, row.quantity]))}
      </div>
      <div class="panel">
        <h3>Por cliente</h3>
        ${table(["Cliente", "Piezas", "Cantidad"], clientRows.map(row => [reportText(row.label), row.count, row.quantity]))}
      </div>
    </section>`);
}

function renderImpresionFactura(option, data) {
  const rows = data.remisiones
    .map(remision => {
      const pieza = data.piezaMap.get(String(remision.piezaId));
      const cliente = cache.clientes.find(item => String(item.id) === String(remision.clienteId));
      return { remision, pieza, cliente };
    })
    .filter(item => item.cliente?.formatoFactura !== false);
  return reportFrame(option, [
    metric("Documentos", rows.length),
    metric("Clientes", uniqueCount(rows, item => item.remision.clienteId)),
    metric("Cantidad", sumReport(rows, item => item.remision.cantidadEntregada))
  ], `
    <section class="panel">
      <h3>Impresion de factura</h3>
      ${table(["Remision", "Fecha", "Cliente", "Pieza", "Cantidad", "Descripcion", "Formato"], rows.map(({ remision, pieza, cliente }) => [
        reportText(remision.folio),
        formatDateTime(remision.fecha),
        reportText(remision.clienteNombre),
        remision.piezaId,
        remision.cantidadEntregada,
        reportText(pieza?.descripcion),
        yesNo(cliente?.formatoFactura !== false)
      ]))}
    </section>`);
}

function renderFacturasGeneradas(option, data) {
  return reportFrame(option, [
    metric("Facturas", 0),
    metric("Remisiones base", data.remisiones.length),
    metric("Ordenes compra", data.ordenesCompra.length)
  ], `
    <section class="panel">
      <h3>Facturas generadas</h3>
      ${table(["Factura", "Fecha", "Cliente", "Importe", "Estatus"], [])}
    </section>`);
}

function reportFrame(option, metrics, body) {
  return `
    <section class="panel report-current">
      <div>
        <h3>${escapeHtml(option.label)}</h3>
        <p class="muted">${escapeHtml(option.detail)}</p>
      </div>
      <div class="grid-3">${metrics.join("")}</div>
    </section>
    ${body}`;
}

function reportPiecesTable(piezas) {
  return table(["Pieza", "Cliente", "OC", "No. parte", "No. dibujo", "Cant.", "Entregada", "Compromiso", "Estatus", "Descripcion"], piezas.map(pieza => [
    pieza.id,
    reportText(pieza.clienteNombre),
    reportText(pieza.ordenCompra),
    reportText(pieza.noParte),
    reportText(pieza.noDibujo),
    pieza.cantidad,
    pieza.cantidadEntregada || 0,
    formatDateOnly(pieza.fechaCompromiso),
    reportText(pieza.estatus),
    reportText(pieza.descripcion)
  ]));
}

function reportOperatorTotals(tiempos) {
  const totals = new Map();
  tiempos.forEach(tiempo => {
    const key = String(tiempo.operadorId || tiempo.operadorNombre || "N/D");
    if (!totals.has(key)) {
      totals.set(key, { operador: tiempo.operadorNombre || "N/D", registros: 0, minutos: 0, piezas: new Set() });
    }
    const row = totals.get(key);
    row.registros += 1;
    row.minutos += Number(tiempo.minutos || 0);
    if (tiempo.piezaId) row.piezas.add(tiempo.piezaId);
  });
  return [...totals.values()].sort((a, b) => b.minutos - a.minutos);
}

function reportTotalsBy(items, keyFn) {
  const totals = new Map();
  items.forEach(item => {
    const key = keyFn(item);
    if (!totals.has(key)) totals.set(key, { label: key, count: 0, quantity: 0 });
    const row = totals.get(key);
    row.count += 1;
    row.quantity += Number(item.cantidad || 0);
  });
  return [...totals.values()].sort((a, b) => b.count - a.count);
}

function reportMatches(values, query) {
  const text = (query || "").trim().toLowerCase();
  if (!text) return true;
  return values.some(value => String(value || "").toLowerCase().includes(text));
}

function reportDate(value) {
  return value ? String(value).slice(0, 10) : "";
}

function daysUntil(value) {
  if (!value) return 9999;
  const today = new Date(todayDate() + "T00:00:00");
  const target = new Date(reportDate(value) + "T00:00:00");
  return Math.round((target - today) / 86400000);
}

function dueBadge(days) {
  if (days < 0) return badge(`${Math.abs(days)} vencido`, "danger");
  if (days === 0) return badge("Hoy", "warning");
  if (days <= 7) return badge(`${days} dias`, "warning");
  return `${days} dias`;
}

function uniqueCount(items, keyFn) {
  return new Set(items.map(keyFn).filter(value => value != null && value !== "")).size;
}

function sumReport(items, valueFn) {
  return items.reduce((total, item) => total + Number(valueFn(item) || 0), 0);
}

function reportText(value) {
  return escapeHtml(value ?? "");
}

function configureExportToolbar(viewName) {
  if (views[viewName]?.exportable === false) {
    actions.innerHTML = "";
    return;
  }
  const importConfig = importConfigFor(viewName);
  actions.innerHTML = `
    <button class="export-button" type="button" data-export="pdf" data-icon="down">PDF</button>
    <button class="export-button" type="button" data-export="csv" data-icon="down">CSV</button>
    <button class="export-button" type="button" data-import="csv" data-icon="up" ${importConfig ? "" : "disabled"}>Importar de CSV</button>
    <input class="csv-import-input" type="file" accept=".csv,text/csv" hidden>
    <span class="toolbar-status" role="status"></span>`;

  actions.querySelector("[data-export='pdf']").addEventListener("click", exportCurrentViewPdf);
  actions.querySelector("[data-export='csv']").addEventListener("click", exportCurrentViewCsv);

  const importInput = actions.querySelector(".csv-import-input");
  const importButton = actions.querySelector("[data-import='csv']");
  importButton.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await handleCsvImport(viewName, file);
  });
}

function importConfigFor(viewName) {
  const config = importConfigs[viewName];
  if (!config) return null;
  if (config.alias) return importConfigFor(config.alias);
  return config;
}

async function handleCsvImport(viewName, file) {
  const config = importConfigFor(viewName);
  if (!config) return;

  setToolbarStatus(`Importando ${file.name}...`);
  try {
    await loadReferenceData();
    const rows = parseCsv(await file.text());
    if (!rows.length) throw new Error("El CSV no tiene registros para importar");

    let imported = 0;
    if (config.importRows) {
      imported = await config.importRows(rows);
    } else {
      for (const [index, row] of rows.entries()) {
        try {
          await api(config.endpoint, {
            method: "POST",
            body: JSON.stringify(config.map(row))
          });
          imported++;
        } catch (error) {
          throw new Error(`Renglon ${index + 2}: ${error.message}`);
        }
      }
    }

    await loadReferenceData();
    setToolbarStatus(`${imported} registro(s) importado(s)`);
    await navigate(currentViewName);
  } catch (error) {
    setToolbarStatus("No se pudo importar", "error");
    alert(error.message || "No se pudo importar el CSV");
  }
}

async function importOrdenesCompraCsv(rows) {
  const groups = new Map();
  rows.forEach((row, index) => {
    const key = textFromCsv(row, ["grupo", "oc", "orden", "folioTemporal", "folio temporal"], `renglon-${index + 1}`);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  let imported = 0;
  for (const groupRows of groups.values()) {
    const first = groupRows[0];
    const proveedorId = resolveReferenceId(
      first,
      ["proveedorId", "id proveedor"],
      ["proveedor", "nombreProveedor", "nombre proveedor"],
      cache.proveedores,
      ["nombreProveedor"]
    );
    if (!proveedorId) throw new Error("Cada OC necesita proveedorId o nombre de proveedor");

    const detalles = groupRows.map(row => ({
      requisicionDetalleId: numberFromCsv(row, ["requisicionDetalleId", "id detalle requisicion", "partida requisicion"], null),
      requisicionFolio: numberFromCsv(row, ["requisicionFolio", "folio requisicion", "req"], null),
      cantidad: numberFromCsv(row, ["cantidad", "cant"], 1),
      descripcion: textFromCsv(row, ["descripcion", "detalle"]),
      destino: textFromCsv(row, ["destino"]),
      material: textFromCsv(row, ["material"]),
      unidadMedida: textFromCsv(row, ["unidadMedida", "unidad", "medida"], "PIEZAS"),
      precioUnitario: numberFromCsv(row, ["precioUnitario", "precio unitario", "precio"], 0)
    }));

    await api("/api/ordenes-compra", {
      method: "POST",
      body: JSON.stringify({
        proveedorId,
        moneda: textFromCsv(first, ["moneda"], "Moneda Nacional"),
        observaciones: textFromCsv(first, ["observaciones"]),
        retencionIvaPct: numberFromCsv(first, ["retencionIvaPct", "ret iva", "retencion iva"], null),
        retencionIsrPct: numberFromCsv(first, ["retencionIsrPct", "ret isr", "retencion isr"], null),
        detalles
      })
    });
    imported++;
  }
  return imported;
}

function exportCurrentViewCsv() {
  const tables = collectExportTables();
  const metrics = collectMetricRows();
  const lines = [];

  if (tables.length) {
    tables.forEach((tableData, index) => {
      if (index) lines.push("");
      lines.push(escapeCsvValue(tableData.title));
      lines.push(tableData.headers.map(escapeCsvValue).join(","));
      tableData.rows.forEach(row => lines.push(row.map(escapeCsvValue).join(",")));
    });
  } else if (metrics.length) {
    lines.push("Indicador,Valor");
    metrics.forEach(row => lines.push(row.map(escapeCsvValue).join(",")));
  } else {
    lines.push("Modulo,Mensaje");
    lines.push([currentModuleTitle(), "Sin datos para exportar"].map(escapeCsvValue).join(","));
  }

  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `${safeFileName(currentModuleTitle())}.csv`);
}

function exportCurrentViewPdf() {
  const pdfBytes = createSimplePdf(buildPdfExportLines());
  downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), `${safeFileName(currentModuleTitle())}.pdf`);
}

function buildPdfExportLines() {
  const tables = collectExportTables();
  const metrics = collectMetricRows();
  const lines = [
    currentModuleTitle(),
    `Exportado ${new Date().toLocaleString("es-MX")}`,
    ""
  ];

  if (tables.length) {
    tables.forEach(tableData => {
      lines.push(tableData.title);
      lines.push(tableData.headers.join(" | "));
      tableData.rows.forEach(row => lines.push(row.join(" | ")));
      lines.push("");
    });
  } else if (metrics.length) {
    lines.push("Indicadores");
    metrics.forEach(row => lines.push(row.join(" | ")));
  } else {
    lines.push("Sin datos para exportar.");
  }
  return lines;
}

function createSimplePdf(lines) {
  const encoder = new TextEncoder();
  const wrappedLines = lines.flatMap(line => wrapPdfLine(line, 108));
  const pages = chunk(wrappedLines, 42);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  const pageObjectNumbers = [];

  pages.forEach((pageLines, index) => {
    const pageObjectNumber = 4 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    pageObjectNumbers.push(pageObjectNumber);
    const stream = drawPdfLines(pageLines);
    objects[pageObjectNumber - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;
    objects[contentObjectNumber - 1] = `<< /Length ${encoder.encode(stream).length} >> stream\n${stream}endstream`;
  });

  objects[1] = `<< /Type /Pages /Kids [${pageObjectNumbers.map(number => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`;

  let body = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(body).length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = encoder.encode(body).length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(offset => {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer << /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xref}\n%%EOF`;
  return encoder.encode(body);
}

function drawPdfLines(lines) {
  let stream = "BT\n/F1 9 Tf\n48 760 Td\n";
  lines.forEach((line, index) => {
    if (index > 0) stream += "0 -16 Td\n";
    stream += `(${escapePdfText(line)}) Tj\n`;
  });
  return `${stream}ET\n`;
}

function wrapPdfLine(value, maxLength) {
  const text = pdfSafeText(value);
  if (text.length <= maxLength) return [text];
  const chunks = [];
  for (let index = 0; index < text.length; index += maxLength) {
    chunks.push(text.slice(index, index + maxLength));
  }
  return chunks;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks.length ? chunks : [[]];
}

function escapePdfText(value) {
  return pdfSafeText(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function pdfSafeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

function buildPrintableExportHtml() {
  const tables = collectExportTables();
  const metrics = collectMetricRows();
  const content = tables.length
    ? tables.map(exportTableHtml).join("")
    : metrics.length
      ? exportTableHtml({ title: "Indicadores", headers: ["Indicador", "Valor"], rows: metrics })
      : "<p>Sin datos para exportar.</p>";

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(currentModuleTitle())}</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; color: #17354f; margin: 24px; }
    h1 { font-size: 22px; margin: 0 0 6px; color: #084d79; }
    .meta { color: #657b8e; margin: 0 0 18px; font-size: 12px; }
    h2 { font-size: 15px; margin: 18px 0 8px; color: #084d79; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 14px; page-break-inside: auto; }
    th, td { border: 1px solid #d4e1eb; padding: 6px 7px; text-align: left; font-size: 11px; vertical-align: top; }
    th { background: #e7eef4; color: #084d79; }
    tr { page-break-inside: avoid; }
    @page { margin: 14mm; }
  </style>
</head>
<body>
  <h1>${escapeHtml(currentModuleTitle())}</h1>
  <p class="meta">Exportado ${escapeHtml(new Date().toLocaleString("es-MX"))}</p>
  ${content}
</body>
</html>`;
}

function exportTableHtml(tableData) {
  return `
    <h2>${escapeHtml(tableData.title)}</h2>
    <table>
      <thead><tr>${tableData.headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${tableData.rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>`;
}

function collectExportTables() {
  return [...root.querySelectorAll("table")].map((tableElement, index) => ({
    title: exportTitleForTable(tableElement, index),
    headers: [...tableElement.querySelectorAll("thead th")].map(cellText),
    rows: [...tableElement.querySelectorAll("tbody tr")].map(row =>
      [...row.children].map(cellText)
    )
  }));
}

function exportTitleForTable(tableElement, index) {
  const sectionTitle = tableElement.closest("section")?.querySelector("h3")?.textContent?.trim();
  if (sectionTitle) return sectionTitle;
  const panelTitle = tableElement.closest(".panel")?.querySelector("h3")?.textContent?.trim();
  return panelTitle || `Tabla ${index + 1}`;
}

function collectMetricRows() {
  return [...root.querySelectorAll(".metric")].map(metricElement => {
    const label = metricElement.querySelector(".muted")?.textContent?.trim() || "Indicador";
    const value = metricElement.querySelector("strong")?.textContent?.trim() || "";
    return [label, value];
  });
}

function cellText(cell) {
  const checkbox = cell.querySelector("input[type='checkbox']");
  if (checkbox) return checkbox.checked ? "Si" : "No";
  const field = cell.querySelector("input, textarea");
  if (field) return field.value || "";
  const select = cell.querySelector("select");
  if (select) return [...select.selectedOptions].map(option => option.textContent.trim()).join("; ");
  return cell.textContent.replace(/\s+/g, " ").trim();
}

function parseCsv(text) {
  const rawRows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index++;
      row.push(cell);
      rawRows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rawRows.push(row);
  const meaningfulRows = rawRows.filter(items => items.some(value => String(value || "").trim()));
  if (!meaningfulRows.length) return [];
  const headers = meaningfulRows.shift().map(normalizeCsvKey);
  return meaningfulRows.map(items => {
    const record = {};
    headers.forEach((header, index) => {
      if (header) record[header] = String(items[index] || "").trim();
    });
    return record;
  });
}

function textFromCsv(row, keys, fallback = "") {
  for (const key of keys) {
    const value = row[normalizeCsvKey(key)];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return fallback;
}

function numberFromCsv(row, keys, fallback = null) {
  const raw = textFromCsv(row, keys, "");
  if (raw === "") return fallback;
  let cleaned = raw.replace(/[$%]/g, "").replace(/\s/g, "");
  if (cleaned.includes(",") && !cleaned.includes(".")) {
    cleaned = cleaned.replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : fallback;
}

function boolFromCsv(row, keys, fallback = false) {
  const raw = textFromCsv(row, keys, "");
  if (raw === "") return fallback;
  const value = normalizeLookup(raw);
  if (["1", "true", "si", "yes", "x", "activo"].includes(value)) return true;
  if (["0", "false", "no", "inactivo"].includes(value)) return false;
  return fallback;
}

function dateFromCsv(row, keys, fallback = "") {
  const raw = textFromCsv(row, keys, "");
  return parseDateString(raw) || fallback;
}

function dateTimeFromCsv(row, keys, fallback = "") {
  const raw = textFromCsv(row, keys, "");
  if (!raw) return fallback;
  const normalized = raw.trim().replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized)) return normalized.slice(0, 16);

  const [datePart, timePart = "08:00"] = raw.trim().split(/\s+/);
  const date = parseDateString(datePart);
  if (!date) return fallback;
  const time = timePart.match(/^\d{1,2}:\d{2}/) ? timePart : "08:00";
  return `${date}T${time.padStart(5, "0").slice(0, 5)}`;
}

function parseDateString(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!match) return "";
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${day}`;
}

function idsFromCsv(row, keys) {
  return textFromCsv(row, keys, "")
    .split(/[;|,\s]+/)
    .map(value => Number(value))
    .filter(Number.isFinite);
}

function resolveReferenceId(row, idKeys, labelKeys, items, labelFields, fallback = null) {
  const directId = numberFromCsv(row, idKeys, null);
  if (directId != null) return directId;

  const label = normalizeLookup(textFromCsv(row, labelKeys, ""));
  if (!label) return fallback ?? null;

  const exact = items.find(item => labelFields.some(field => normalizeLookup(item[field]) === label));
  if (exact) return exact.id;
  const partial = items.find(item => labelFields.some(field => normalizeLookup(item[field]).includes(label)));
  return partial?.id ?? fallback ?? null;
}

function normalizeCsvKey(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeLookup(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function currentModuleTitle() {
  return title.textContent || views[currentViewName]?.title || "Tornos SA de CV";
}

function safeFileName(value) {
  return normalizeLookup(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "export";
}

function setToolbarStatus(message, tone = "") {
  const status = actions.querySelector(".toolbar-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error-message", tone === "error");
}

function submitJson(url, after) {
  return async event => {
    event.preventDefault();
    const data = normalize(formData(event.currentTarget));
    await api(url, { method: "POST", body: JSON.stringify(data) });
    await after();
  };
}

function normalize(data) {
  const numeric = new Set(["id", "clienteId", "proveedorId", "estatusId", "operadorId", "piezaId", "articuloId", "cantidad", "cantidadEntregada", "turno", "precio", "tipoCambioUsdMxn", "existencia", "minimo", "maximo", "puntoReorden", "precioUnitario", "retencionIvaPct", "retencionIsrPct"]);
  const booleans = new Set(["activo", "supervisor", "chofer", "entregado", "formatoFactura"]);
  return Object.fromEntries(Object.entries(data).map(([key, value]) => {
    if (booleans.has(key)) return [key, value === "true"];
    if (numeric.has(key) && value !== "") return [key, Number(value)];
    return [key, value === "" ? null : value];
  }));
}

function metric(label, value, tone = "") {
  return `<div class="metric"><span class="muted">${label}</span><strong>${value}</strong>${tone ? `<span class="badge ${tone}">${tone}</span>` : ""}</div>`;
}

function table(headers, rows) {
  if (!rows.length) return `<div class="table-wrap empty-state">Sin registros</div>`;
  const safeHeaders = headers.map(h => escapeHtml(h));
  return `<div class="table-wrap"><table><thead><tr>${safeHeaders.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((cell, index) => `<td data-label="${safeHeaders[index] || ""}">${cell ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function options(items, valueField, labelField, selectedValue = null) {
  return items.map(item => {
    const selected = selectedValue != null && String(item[valueField]) === String(selectedValue) ? " selected" : "";
    return `<option value="${item[valueField]}"${selected}>${escapeHtml(item[labelField] || item.descripcion || item.nombreCliente || item.id)}</option>`;
  }).join("");
}

function proveedorOptions(proveedores) {
  return proveedores.map(proveedor => `
    <option value="${proveedor.id}"
      data-retencion-iva="${Number(proveedor.retencionIvaPct || 0)}"
      data-retencion-isr="${Number(proveedor.retencionIsrPct || 0)}">
      ${escapeHtml(proveedor.nombreProveedor)}
    </option>`).join("");
}

function applyProveedorRetenciones(form) {
  const selected = form.proveedorId.selectedOptions[0];
  form.retencionIvaPct.value = selected?.dataset.retencionIva || "0";
  form.retencionIsrPct.value = selected?.dataset.retencionIsr || "0";
}

function piezaOption(pieza) {
  const oc = pieza.ordenCompra ? `OC ${pieza.ordenCompra}` : "Sin OC";
  return `<option value="${pieza.id}">${escapeHtml(`${pieza.descripcion} | ${oc} | ${pieza.cantidad} pza(s)`)}</option>`;
}

function piezaRemisionOption(pieza) {
  return `<option value="${pieza.id}">${escapeHtml(`${pieza.clienteNombre} | OC ${pieza.ordenCompra} | ${pieza.noParte || "Sin no. parte"} | ${pieza.descripcion}`)}</option>`;
}

function filterPiezas(piezas, query) {
  const text = (query || "").trim().toLowerCase();
  if (!text) return piezas;
  return piezas.filter(pieza => [
    pieza.clienteNombre,
    pieza.ordenCompra,
    pieza.noParte,
    pieza.noDibujo,
    pieza.descripcion,
    pieza.estatus
  ].some(value => String(value || "").toLowerCase().includes(text)));
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatUsd(value) {
  return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatExchangeRate(value) {
  return Number(value || 0).toLocaleString("es-MX", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function formatPercent(value) {
  return Number(value || 0).toLocaleString("es-MX", { maximumFractionDigits: 4 });
}

function formatDateTime(value) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 16);
}

function formatDateOnly(value) {
  if (!value) return "";
  const [date] = String(value).split("T");
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
}

function formatDateTimeFull(value) {
  if (!value) return "";
  const [date, rawTime = ""] = String(value).split("T");
  const time = rawTime.slice(0, 8);
  return `${formatDateOnly(date)}${time ? ` ${time}` : ""}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function inDateRange(value, desde, hasta) {
  if (!value) return true;
  if (desde && value < desde) return false;
  if (hasta && value > hasta) return false;
  return true;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function defaultCommitmentDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function badge(value, tone) {
  return `<span class="badge ${tone}">${escapeHtml(String(value))}</span>`;
}

function yesNo(value) {
  return value ? "Si" : "No";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
