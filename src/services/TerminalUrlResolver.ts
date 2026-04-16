/**
 * Resolves vendor-specific terminal API paths from the unified
 * (type, module, method) routing used by the proxy.
 *
 * NOTE: These paths are based on standard Hikvision ISAPI and Dahua CGI-BIN
 * documentation. Verify against real devices if behavior differs.
 */

type HttpMethod = "POST" | "PUT" | "DELETE" | "GET";

interface RouteEntry {
  path: string;
  /** Override HTTP method sent to terminal (e.g. HIK uses PUT for create/delete) */
  terminalMethod?: HttpMethod;
}

const HIK_ROUTES: Record<string, Record<HttpMethod, RouteEntry | undefined>> = {
  card: {
    POST: {
      path: "/ISAPI/AccessControl/UserInfo/Record?format=json",
      terminalMethod: "PUT",
    },
    PUT: {
      path: "/ISAPI/AccessControl/UserInfo/Modify?format=json",
      terminalMethod: "PUT",
    },
    DELETE: {
      path: "/ISAPI/AccessControl/UserInfo/Delete?format=json",
      terminalMethod: "PUT",
    },
    GET: undefined,
  },
  cards: {
    POST: {
      path: "/ISAPI/AccessControl/UserInfo/Search?format=json",
      terminalMethod: "POST",
    },
    PUT: undefined,
    DELETE: {
      path: "/ISAPI/AccessControl/UserInfo/Delete?format=json",
      terminalMethod: "PUT",
    },
    GET: undefined,
  },
  fizcard: {
    POST: {
      path: "/ISAPI/AccessControl/CardInfo/Record?format=json",
      terminalMethod: "POST",
    },
    PUT: undefined,
    DELETE: undefined,
    GET: undefined,
  },
  face: {
    POST: {
      path: "/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json",
      terminalMethod: "POST",
    },
    PUT: {
      path: "/ISAPI/Intelligent/FDLib/1/FaceDataRecord/edit?format=json",
      terminalMethod: "PUT",
    },
    DELETE: {
      path: "/ISAPI/Intelligent/FDLib/1/pictureInfo/delete?format=json",
      terminalMethod: "PUT",
    },
    GET: undefined,
  },
};

const DAH_ROUTES: Record<string, Record<HttpMethod, RouteEntry | undefined>> = {
  card: {
    POST: { path: "/cgi-bin/AccessCard.cgi?action=insertMulti" },
    PUT: { path: "/cgi-bin/AccessCard.cgi?action=update" },
    DELETE: { path: "/cgi-bin/AccessCard.cgi?action=remove" },
    GET: { path: "/cgi-bin/AccessCard.cgi?action=list" },
  },
  cards: {
    POST: undefined,
    PUT: undefined,
    DELETE: { path: "/cgi-bin/AccessCard.cgi?action=removeAll" },
    GET: undefined,
  },
  face: {
    POST: { path: "/cgi-bin/FaceInfoManager.cgi?action=add" },
    PUT: { path: "/cgi-bin/FaceInfoManager.cgi?action=update" },
    DELETE: undefined,
    GET: { path: "/cgi-bin/FaceInfoManager.cgi?action=startFind" },
  },
  faces: {
    POST: { path: "/cgi-bin/FaceInfoManager.cgi?action=doFind" },
    PUT: undefined,
    DELETE: undefined,
    GET: undefined,
  },
};

const ROUTE_TABLES: Record<
  string,
  Record<string, Record<HttpMethod, RouteEntry | undefined>>
> = {
  hik: HIK_ROUTES,
  dah: DAH_ROUTES,
};

export interface ResolvedRoute {
  /** Full path to call on the terminal (e.g. /ISAPI/AccessControl/...) */
  path: string;
  /** HTTP method to use for the actual terminal call */
  method: HttpMethod;
}

/**
 * Resolve the terminal-specific API path from proxy-style headers.
 */
export function resolveTerminalRoute(
  type: string,
  module: string,
  method: HttpMethod,
): ResolvedRoute {
  const table = ROUTE_TABLES[type];
  if (!table) {
    throw new Error(`Unknown terminal type: "${type}"`);
  }

  const moduleRoutes = table[module];
  if (!moduleRoutes) {
    throw new Error(
      `Unknown module "${module}" for terminal type "${type}"`,
    );
  }

  const entry = moduleRoutes[method];
  if (!entry) {
    throw new Error(
      `No route for ${method} ${type}/${module}`,
    );
  }

  return {
    path: entry.path,
    method: entry.terminalMethod || method,
  };
}
