export default {
  async fetch(request) {
    const origin = request.headers.get("origin");
    const allowedOrigins = new Set([
      "https://finsim.ie",
      "http://localhost:8080",
    ]);
    const allowOrigin = allowedOrigins.has(origin) ? origin : "";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": allowOrigin,
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "content-type",
          "cache-control": "no-store",
          "vary": "Origin",
        },
      });
    }

    // ISO 3166-1 alpha-2 country code (e.g., "IE")
    const country = request.cf?.country ?? "XX";

    return Response.json(
      { country },
      {
        headers: {
          "cache-control": "private, max-age=3600",
          "access-control-allow-origin": allowOrigin,
          "vary": "Origin",
        },
      }
    );
  },
};

