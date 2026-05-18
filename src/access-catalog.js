export const ACCESS_ACTION_KEYS = ["canView", "canCreate", "canUpdate", "canDelete", "canImport", "canExport"];

export const ACCESS_CATALOG = [
  { id: "dashboard", label: "Dashboard", group: "Principal", type: "module" },
  { id: "catalogosMenu", label: "Catalogos", group: "Principal", type: "menu" },
  { id: "clientes", label: "Clientes", group: "Catalogos", type: "module", parent: "catalogosMenu" },
  { id: "proveedores", label: "Proveedores", group: "Catalogos", type: "module", parent: "catalogosMenu" },
  { id: "operadores", label: "Operadores", group: "Catalogos", type: "module", parent: "catalogosMenu" },
  { id: "produccionMenu", label: "Produccion", group: "Principal", type: "menu" },
  { id: "piezas", label: "Piezas", group: "Produccion", type: "module", parent: "produccionMenu" },
  { id: "ordenes", label: "Ordenes de trabajo", group: "Produccion", type: "module", parent: "produccionMenu" },
  { id: "monitor", label: "Monitor de produccion", group: "Produccion", type: "module", parent: "produccionMenu" },
  { id: "tiempos", label: "Tiempos", group: "Produccion", type: "module", parent: "produccionMenu" },
  { id: "comprasMenu", label: "Compras", group: "Principal", type: "menu" },
  { id: "requisiciones", label: "Requisiciones", group: "Compras", type: "module", parent: "comprasMenu" },
  { id: "ordenesCompra", label: "Ordenes de compra", group: "Compras", type: "module", parent: "comprasMenu" },
  { id: "almacen", label: "Almacen", group: "Principal", type: "module" },
  { id: "remisiones", label: "Remisiones", group: "Principal", type: "module" },
  { id: "reportes", label: "Reportes", group: "Principal", type: "module" },
  { id: "ajustes", label: "Ajustes", group: "Principal", type: "module" }
];
