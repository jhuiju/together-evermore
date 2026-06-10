import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/kakao/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const query = url.searchParams.get("query")?.trim();
        const size = url.searchParams.get("size") ?? "10";

        if (!query) {
          return Response.json({ documents: [] }, { status: 200 });
        }

        const apiKey = process.env.KAKAO_REST_API_KEY;
        if (!apiKey) {
          console.error("[kakao/search] KAKAO_REST_API_KEY is not configured");
          return Response.json(
            { error: "KAKAO_REST_API_KEY is not configured" },
            { status: 500 },
          );
        }

        const kakaoUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=${encodeURIComponent(size)}`;
        console.log("[kakao/search] requesting", kakaoUrl, {
          headers: { Authorization: "KakaoAK ***" },
        });

        try {
          const res = await fetch(kakaoUrl, {
            headers: { Authorization: `KakaoAK ${apiKey}` },
          });
          const text = await res.text();
          if (!res.ok) {
            console.error("[kakao/search] non-ok response", res.status, text);
            return Response.json(
              { error: `Kakao API ${res.status}`, detail: text },
              { status: res.status },
            );
          }
          let json: any;
          try {
            json = JSON.parse(text);
          } catch (e) {
            console.error("[kakao/search] invalid JSON", text);
            return Response.json(
              { error: "Invalid JSON from Kakao", detail: text },
              { status: 502 },
            );
          }
          console.log(
            "[kakao/search] got",
            Array.isArray(json?.documents) ? json.documents.length : 0,
            "documents",
          );
          return Response.json(json, { status: 200 });
        } catch (e: any) {
          console.error("[kakao/search] fetch failed", e);
          return Response.json(
            { error: e?.message ?? "fetch failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});