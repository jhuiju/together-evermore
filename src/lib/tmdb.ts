export const TMDB_BASE_URL = "https://api.themoviedb.org/3";
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export const TMDB_GENRES: Record<number, string> = {
  28: "액션",
  12: "모험",
  16: "애니메이션",
  35: "코미디",
  80: "범죄",
  99: "다큐멘터리",
  18: "드라마",
  10751: "가족",
  14: "판타지",
  36: "역사",
  27: "공포",
  10402: "음악",
  9648: "미스터리",
  10749: "로맨스",
  878: "SF",
  10770: "TV 영화",
  53: "스릴러",
  10752: "전쟁",
  37: "서부",
};

export interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  poster_path: string | null;
  release_date: string;
  genre_ids: number[];
  overview?: string;
}

export function tmdbPosterUrl(
  path: string | null,
  size: "w92" | "w154" | "w185" | "w342" | "w500" | "original" = "w185",
): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function tmdbReleaseYear(release_date?: string): string {
  if (!release_date) return "";
  return release_date.slice(0, 4);
}

export function tmdbGenreNames(ids: number[] | undefined): string[] {
  if (!ids) return [];
  return ids.map((id) => TMDB_GENRES[id]).filter(Boolean);
}

export async function searchTmdbMovies(
  query: string,
  signal?: AbortSignal,
): Promise<TmdbMovie[]> {
  const apiKey = import.meta.env.VITE_TMDB_API_KEY as string | undefined;
  if (!apiKey) throw new Error("VITE_TMDB_API_KEY가 설정되지 않았어요.");
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url = new URL(`${TMDB_BASE_URL}/search/movie`);
  url.searchParams.set("query", trimmed);
  url.searchParams.set("language", "ko-KR");
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("api_key", apiKey);
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`TMDB 요청 실패 (${res.status})`);
  const data = (await res.json()) as { results?: TmdbMovie[] };
  return data.results ?? [];
}