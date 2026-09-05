// The /api/v1 contract as a typed object. GET /api/v1/openapi.json serialises it; GET /api/v1/docs
// renders it as HTML. Keep component shapes in sync with serialize.ts.

export type Schema = Record<string, unknown>;
export type Parameter = { name: string; in: "query" | "path"; required?: boolean; description?: string; schema: Schema };
export type Operation = {
  operationId: string;
  summary: string;
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: { required?: boolean; content: { "application/json": { schema: Schema } } };
  responses: Record<string, { description: string; content?: { "application/json": { schema: Schema } } }>;
  security?: Record<string, string[]>[];
};
export type Method = "get" | "post" | "patch" | "delete";
export type PathItem = Partial<Record<Method, Operation>>;
export type OpenApiDocument = {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: { url: string; description?: string }[];
  security: Record<string, string[]>[];
  tags: { name: string; description: string }[];
  paths: Record<string, PathItem>;
  components: { securitySchemes: Record<string, Schema>; schemas: Record<string, Schema>; parameters: Record<string, Parameter>; responses: Record<string, { description: string; content?: { "application/json": { schema: Schema } } }> };
  webhooks: Record<string, { post: Operation }>;
};

export const API_VERSION = "1.0.0";
export const SIGNATURE_HEADER = "X-Pressdesk-Signature";
export const WEBHOOK_EVENTS = ["release.published", "distribution.completed", "coverage.created", "contact.bounced", "conversation.created"] as const;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const dateTime: Schema = { type: "string", format: "date-time" };
const nullableString: Schema = { type: "string", nullable: true };

const pageParams: Parameter[] = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 }, description: "1-based page number." },
  { name: "per", in: "query", schema: { type: "integer", minimum: 1, maximum: 250, default: 100 }, description: "Rows per page, capped at 250." },
];
const idParam: Parameter = { name: "id", in: "path", required: true, schema: { type: "string" } };

function pageOf(item: string): Schema {
  return { allOf: [ref("Page"), { type: "object", properties: { data: { type: "array", items: ref(item) } } }] };
}
const errorResponses = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "401": { $ref: "#/components/responses/Unauthorized" },
  "429": { $ref: "#/components/responses/RateLimited" },
} as unknown as Operation["responses"];
const notFound = { "404": { $ref: "#/components/responses/NotFound" } } as unknown as Operation["responses"];

const CONTACT_PROPS: Record<string, Schema> = {
  id: { type: "string" }, firstName: { type: "string" }, lastName: { type: "string" }, email: { ...nullableString, format: "email" },
  emailStatus: { type: "string", enum: ["UNVERIFIED", "VALID", "INVALID", "RISKY", "BOUNCED", "COMPLAINED", "UNSUBSCRIBED"] },
  jobTitle: nullableString, outlet: nullableString, mobile: nullableString, landline: nullableString,
  tags: { type: "array", items: { type: "string" } }, createdAt: dateTime, updatedAt: dateTime,
};

export const openapi: OpenApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Pressdesk API",
    version: API_VERSION,
    description: "Media contacts, lists, press releases and coverage for one Pressdesk account. Authenticate with an API key from Settings > API as a Bearer token. Requests are limited to 300 per minute per key; a 429 response carries a Retry-After header.",
  },
  servers: [{ url: "http://localhost:3000", description: "This deployment" }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "Contacts", description: "Media contacts in the account." },
    { name: "Lists", description: "Static lists and their members. Smart groups are read-only." },
    { name: "Releases", description: "Press releases and newsletters with send statistics." },
    { name: "Coverage", description: "Earned media coverage items." },
    { name: "Meta", description: "Documentation endpoints. No key needed." },
  ],
  paths: {
    "/api/v1/contacts": {
      get: {
        operationId: "listContacts", tags: ["Contacts"], summary: "List contacts",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Search name, outlet, email or title." },
          { name: "list", in: "query", schema: { type: "string" }, description: "Only members of this list id." },
          { name: "tag", in: "query", schema: { type: "string" }, description: "Only contacts carrying this tag (id or name)." },
          { name: "updatedSince", in: "query", schema: dateTime, description: "Only contacts changed at or after this time." },
          ...pageParams,
        ],
        responses: { "200": { description: "A page of contacts", content: { "application/json": { schema: pageOf("Contact") } } }, ...errorResponses },
      },
      post: {
        operationId: "createContact", tags: ["Contacts"], summary: "Create a contact",
        requestBody: { required: true, content: { "application/json": { schema: ref("ContactCreate") } } },
        responses: { "201": { description: "Created", content: { "application/json": { schema: ref("Contact") } } }, "402": { $ref: "#/components/responses/PlanLimit" } as any, ...errorResponses },
      },
    },
    "/api/v1/contacts/{id}": {
      get: { operationId: "getContact", tags: ["Contacts"], summary: "Get a contact", parameters: [idParam], responses: { "200": { description: "The contact", content: { "application/json": { schema: ref("Contact") } } }, ...notFound, ...errorResponses } },
      patch: {
        operationId: "updateContact", tags: ["Contacts"], summary: "Update a contact", parameters: [idParam],
        description: "Send only the fields to change. Pass null to clear an optional field. `tags` replaces the full tag set.",
        requestBody: { required: true, content: { "application/json": { schema: ref("ContactPatch") } } },
        responses: { "200": { description: "The updated contact", content: { "application/json": { schema: ref("Contact") } } }, ...notFound, ...errorResponses },
      },
      delete: { operationId: "deleteContact", tags: ["Contacts"], summary: "Delete a contact (moves it to Deleted Items for 30 days)", parameters: [idParam], responses: { "200": { description: "Deleted", content: { "application/json": { schema: ref("Ok") } } }, ...notFound, ...errorResponses } },
    },
    "/api/v1/lists": {
      get: { operationId: "listLists", tags: ["Lists"], summary: "List lists", parameters: pageParams, responses: { "200": { description: "A page of lists", content: { "application/json": { schema: pageOf("List") } } }, ...errorResponses } },
      post: {
        operationId: "createList", tags: ["Lists"], summary: "Create a static list",
        requestBody: { required: true, content: { "application/json": { schema: ref("ListCreate") } } },
        responses: { "201": { description: "Created", content: { "application/json": { schema: ref("List") } } }, ...errorResponses },
      },
    },
    "/api/v1/lists/{id}/members": {
      get: { operationId: "listMembers", tags: ["Lists"], summary: "List the contacts in a list", parameters: [idParam, ...pageParams], responses: { "200": { description: "A page of contacts", content: { "application/json": { schema: pageOf("Contact") } } }, ...notFound, ...errorResponses } },
      post: {
        operationId: "addMembers", tags: ["Lists"], summary: "Add contacts to a list", parameters: [idParam],
        requestBody: { required: true, content: { "application/json": { schema: ref("Members") } } },
        responses: { "200": { description: "Count added", content: { "application/json": { schema: ref("MemberChange") } } }, ...notFound, ...errorResponses },
      },
      delete: {
        operationId: "removeMembers", tags: ["Lists"], summary: "Remove contacts from a list", parameters: [idParam],
        requestBody: { required: true, content: { "application/json": { schema: ref("Members") } } },
        responses: { "200": { description: "Count removed", content: { "application/json": { schema: ref("MemberChange") } } }, ...notFound, ...errorResponses },
      },
    },
    "/api/v1/releases": {
      get: {
        operationId: "listReleases", tags: ["Releases"], summary: "List releases with send stats",
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["DRAFT", "SCHEDULED", "LIVE", "ARCHIVED"] } },
          { name: "client", in: "query", schema: { type: "string" }, description: "Client id or exact name." },
          { name: "publishedSince", in: "query", schema: dateTime },
          ...pageParams,
        ],
        responses: { "200": { description: "A page of releases", content: { "application/json": { schema: pageOf("Release") } } }, ...errorResponses },
      },
    },
    "/api/v1/releases/{id}": {
      get: { operationId: "getRelease", tags: ["Releases"], summary: "Get a release with body, tags and distributions", parameters: [idParam], responses: { "200": { description: "The release", content: { "application/json": { schema: ref("ReleaseDetail") } } }, ...notFound, ...errorResponses } },
    },
    "/api/v1/coverage": {
      get: {
        operationId: "listCoverage", tags: ["Coverage"], summary: "List coverage",
        parameters: [
          { name: "client", in: "query", schema: { type: "string" }, description: "Client id or exact name." },
          { name: "release", in: "query", schema: { type: "string" }, description: "Release id." },
          { name: "from", in: "query", schema: dateTime, description: "publishedAt at or after." },
          { name: "to", in: "query", schema: dateTime, description: "publishedAt at or before." },
          { name: "type", in: "query", schema: { type: "string", enum: ["BROADCAST", "ONLINE", "PRINT", "RADIO", "PODCAST", "SOCIAL"] } },
          ...pageParams,
        ],
        responses: { "200": { description: "A page of coverage", content: { "application/json": { schema: pageOf("Coverage") } } }, ...errorResponses },
      },
      post: {
        operationId: "createCoverage", tags: ["Coverage"], summary: "Log a coverage item",
        description: "Also queues a `coverage.created` webhook delivery for every endpoint subscribed to that event.",
        requestBody: { required: true, content: { "application/json": { schema: ref("CoverageCreate") } } },
        responses: { "201": { description: "Created", content: { "application/json": { schema: ref("Coverage") } } }, ...errorResponses },
      },
    },
    "/api/v1/openapi.json": { get: { operationId: "getOpenApi", tags: ["Meta"], summary: "This document", security: [], responses: { "200": { description: "OpenAPI 3.0 JSON" } } } },
    "/api/v1/docs": { get: { operationId: "getDocs", tags: ["Meta"], summary: "Human-readable listing of the API", security: [], responses: { "200": { description: "HTML" } } } },
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "API key from Settings > API. Also accepted as an X-Api-Key header." } },
    parameters: { page: pageParams[0], per: pageParams[1], id: idParam },
    responses: {
      BadRequest: { description: "Validation failed", content: { "application/json": { schema: ref("Error") } } },
      Unauthorized: { description: "Missing, revoked or unknown API key", content: { "application/json": { schema: ref("Error") } } },
      NotFound: { description: "No such record in this account", content: { "application/json": { schema: ref("Error") } } },
      RateLimited: { description: "More than 300 requests in a minute. Retry-After header gives the wait in seconds.", content: { "application/json": { schema: ref("Error") } } },
      PlanLimit: { description: "The account's plan limit would be exceeded", content: { "application/json": { schema: ref("Error") } } },
    },
    schemas: {
      Error: { type: "object", required: ["error"], properties: { error: { type: "string" }, issues: { type: "array", items: { type: "object", properties: { path: { type: "string" }, message: { type: "string" } } } } } },
      Ok: { type: "object", properties: { ok: { type: "boolean" } } },
      Page: { type: "object", required: ["total", "page", "per", "pages", "data"], properties: { total: { type: "integer" }, page: { type: "integer" }, per: { type: "integer" }, pages: { type: "integer" }, data: { type: "array", items: {} } } },
      Contact: { type: "object", required: ["id", "firstName", "lastName", "emailStatus", "tags"], properties: CONTACT_PROPS },
      ContactCreate: {
        type: "object", required: ["firstName"],
        properties: { firstName: { type: "string" }, lastName: { type: "string" }, email: { type: "string", format: "email" }, jobTitle: { type: "string" }, outlet: { type: "string", description: "Organization name; created if new." }, mobile: { type: "string" }, landline: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
      },
      ContactPatch: {
        type: "object", minProperties: 1,
        properties: { firstName: { type: "string" }, lastName: { type: "string" }, email: { ...nullableString, format: "email" }, jobTitle: nullableString, outlet: nullableString, mobile: nullableString, landline: nullableString, tags: { type: "array", items: { type: "string" } } },
      },
      List: { type: "object", required: ["id", "name", "isSmart", "memberCount"], properties: { id: { type: "string" }, name: { type: "string" }, description: nullableString, isSmart: { type: "boolean" }, memberCount: { type: "integer" }, createdAt: dateTime, updatedAt: dateTime } },
      ListCreate: { type: "object", required: ["name"], properties: { name: { type: "string" }, description: { type: "string" } } },
      Members: { type: "object", required: ["contactIds"], properties: { contactIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 1000 } } },
      MemberChange: { type: "object", properties: { ok: { type: "boolean" }, count: { type: "integer" }, memberCount: { type: "integer" } } },
      ReleaseStats: { type: "object", properties: { sent: { type: "integer" }, delivered: { type: "integer" }, opened: { type: "integer" } } },
      Release: {
        type: "object", required: ["id", "headline", "slug", "status", "shortCode", "newsroomPath", "stats"],
        properties: {
          id: { type: "string" }, headline: { type: "string" }, slug: { type: "string" }, status: { type: "string", enum: ["DRAFT", "SCHEDULED", "LIVE", "ARCHIVED"] }, kind: { type: "string", enum: ["PRESS_RELEASE", "NEWSLETTER"] },
          publishedAt: { ...dateTime, nullable: true }, scheduledFor: { ...dateTime, nullable: true }, shortCode: { type: "string" }, shortLink: { type: "string", description: "Path of the short link, /r/<shortCode>." },
          newsroomPath: { type: "string", description: "Path on the newsroom, /n/<accountSlug>/<releaseSlug>." },
          client: { type: "object", nullable: true, properties: { id: { type: "string" }, name: { type: "string" } } },
          stats: ref("ReleaseStats"), createdAt: dateTime, updatedAt: dateTime,
        },
      },
      ReleaseDetail: {
        allOf: [ref("Release"), { type: "object", properties: {
          subheadline: nullableString, body: { type: "string", description: "Sanitised HTML" }, tags: { type: "array", items: { type: "string" } },
          distributions: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, status: { type: "string" }, subject: { type: "string" }, recipientCount: { type: "integer" }, delivered: { type: "integer" }, opened: { type: "integer" }, bounced: { type: "integer" }, startedAt: { ...dateTime, nullable: true }, completedAt: { ...dateTime, nullable: true } } } },
        } }],
      },
      Coverage: {
        type: "object", required: ["id", "outletName", "headline", "publishedAt", "type"],
        properties: {
          id: { type: "string" }, outletName: { type: "string" }, headline: { type: "string" }, url: nullableString, publishedAt: dateTime,
          type: { type: "string", enum: ["BROADCAST", "ONLINE", "PRINT", "RADIO", "PODCAST", "SOCIAL"] }, focus: { type: "string", enum: ["NATIONAL", "REGIONAL", "LOCAL", "TRADE", "INTERNATIONAL"] }, sentiment: { type: "string", enum: ["POSITIVE", "NEUTRAL", "NEGATIVE"] },
          clientId: nullableString, releaseId: nullableString, estimatedReach: { type: "integer", nullable: true }, adValue: { type: "number", nullable: true }, pickupCount: { type: "integer" }, createdAt: dateTime, updatedAt: dateTime,
        },
      },
      CoverageCreate: {
        type: "object", required: ["outletName", "headline", "publishedAt", "type"],
        properties: {
          outletName: { type: "string" }, headline: { type: "string" }, url: { type: "string", format: "uri" }, publishedAt: dateTime,
          type: { type: "string", enum: ["BROADCAST", "ONLINE", "PRINT", "RADIO", "PODCAST", "SOCIAL"] }, focus: { type: "string", enum: ["NATIONAL", "REGIONAL", "LOCAL", "TRADE", "INTERNATIONAL"] }, sentiment: { type: "string", enum: ["POSITIVE", "NEUTRAL", "NEGATIVE"] },
          clientId: { type: "string" }, releaseId: { type: "string" }, estimatedReach: { type: "integer", minimum: 0 }, adValue: { type: "number", minimum: 0 },
        },
      },
      WebhookEnvelope: {
        type: "object", required: ["event", "createdAt", "data"],
        description: `Every delivery is a POST with this JSON body and an ${SIGNATURE_HEADER} header of the form sha256=<hex HMAC-SHA256 of the raw body using the endpoint secret>.`,
        properties: { id: { type: "string", description: "Delivery id; the same id is reused on retries." }, event: { type: "string", enum: [...WEBHOOK_EVENTS] }, createdAt: dateTime, data: { type: "object" } },
      },
    },
  },
  webhooks: {
    "release.published": webhook("release.published", "A release went live on the newsroom.", { release: ref("Release") }),
    "distribution.completed": webhook("distribution.completed", "A distribution finished sending.", { distributionId: { type: "string" }, releaseId: { type: "string" }, recipientCount: { type: "integer" }, delivered: { type: "integer" }, bounced: { type: "integer" } }),
    "coverage.created": webhook("coverage.created", "A coverage item was logged (UI, import or API).", { coverage: ref("Coverage") }),
    "contact.bounced": webhook("contact.bounced", "A contact's address hard-bounced and was marked BOUNCED.", { contactId: { type: "string" }, email: { type: "string" }, bounceType: { type: "string" }, distributionId: { type: "string" } }),
    "conversation.created": webhook("conversation.created", "A new Response Desk conversation was opened.", { conversationId: { type: "string" }, outletName: nullableString, question: { type: "string" }, deadline: { ...dateTime, nullable: true } }),
  },
};

function webhook(event: string, description: string, dataProps: Record<string, Schema>): { post: Operation } {
  return {
    post: {
      operationId: `on_${event.replace(".", "_")}`, summary: event, description, tags: ["Webhooks"], security: [],
      parameters: [{ name: SIGNATURE_HEADER, in: "query" as any, description: "Sent as an HTTP header, not a query parameter: sha256=<hex hmac of the raw body with the endpoint secret>.", schema: { type: "string" } }],
      requestBody: { required: true, content: { "application/json": { schema: { allOf: [ref("WebhookEnvelope"), { type: "object", properties: { event: { type: "string", enum: [event] }, data: { type: "object", properties: dataProps } } }] } } } },
      responses: { "2xx": { description: "Acknowledged. Anything else is retried with backoff up to 5 attempts." } },
    },
  };
}

/** The document with the server URL filled in from APP_URL. */
export function buildOpenApi(appUrl = process.env.APP_URL ?? "http://localhost:3000"): OpenApiDocument {
  const doc: OpenApiDocument = JSON.parse(JSON.stringify(openapi));
  doc.servers = [{ url: appUrl.replace(/\/$/, ""), description: "This deployment" }];
  return doc;
}

/** Flat listing for the docs page. */
export function listOperations(doc: OpenApiDocument = openapi) {
  const out: { method: string; path: string; summary: string; tag: string; auth: boolean; params: string[] }[] = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const m of ["get", "post", "patch", "delete"] as const) {
      const op = item[m];
      if (!op) continue;
      out.push({ method: m.toUpperCase(), path, summary: op.summary, tag: op.tags?.[0] ?? "", auth: op.security === undefined || op.security.length > 0, params: (op.parameters ?? []).filter((p) => p.in === "query").map((p) => p.name) });
    }
  }
  return out;
}
