import { useEffect, useMemo, useRef, useState } from "react";
import { Film, Search, X, Loader2 } from "lucide-react";
import {
  searchTmdbMovies,
  tmdbGenreNames,
  tmdbPosterUrl,
  tmdbReleaseYear,
  type TmdbMovie,
} from "@/lib/tmdb";

const MAX_RESULTS = 8;
const DEBOUNCE_MS = 400;

interface MovieSearchInputProps {
  value: TmdbMovie | null;
  onChange: (movie: TmdbMovie | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function MovieSearchInput({
  value,
  onChange,
  placeholder = "영화 제목을 검색해보세요",
  autoFocus,
}: MovieSearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TmdbMovie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (value) return; // Don't search when a movie is already selected
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setError(null);
      setSearched(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const data = await searchTmdbMovies(trimmed, controller.signal);
        setResults(data.slice(0, MAX_RESULTS));
        setSearched(true);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || "검색 중 오류가 발생했어요.");
        setResults([]);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [query, value]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const showDropdown = useMemo(
    () => open && !value && query.trim().length > 0,
    [open, value, query],
  );

  if (value) {
    return (
      <SelectedMovieCard
        movie={value}
        onClear={() => {
          onChange(null);
          setQuery("");
          setResults([]);
          setSearched(false);
          setOpen(true);
        }}
      />
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--app-muted)] pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className="w-full h-11 pl-9 pr-9 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] text-sm text-[var(--app-text)] placeholder:text-[var(--app-muted)] focus:outline-none focus:border-[var(--app-pink)] transition-colors"
        />
        {loading ? (
          <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-muted)] animate-spin" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
              setSearched(false);
            }}
            aria-label="검색어 지우기"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-[var(--app-muted)] hover:text-[var(--app-text)]"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {showDropdown && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] shadow-lg overflow-hidden">
          {error ? (
            <div className="px-4 py-6 text-sm text-center text-[var(--app-muted)]">
              {error}
            </div>
          ) : loading && results.length === 0 ? (
            <div className="px-4 py-6 text-sm text-center text-[var(--app-muted)]">
              검색 중…
            </div>
          ) : results.length === 0 && searched ? (
            <div className="px-4 py-6 text-sm text-center text-[var(--app-muted)]">
              검색 결과가 없어요
            </div>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto divide-y divide-[var(--app-divider)]">
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(m);
                      setOpen(false);
                    }}
                    className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-[var(--app-bg)] transition-colors"
                  >
                    <MoviePoster
                      posterPath={m.poster_path}
                      title={m.title}
                      className="w-10 h-14 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--app-text)] truncate">
                        {m.title || m.original_title}
                      </p>
                      {m.original_title && m.original_title !== m.title && (
                        <p className="text-xs text-[var(--app-muted)] truncate">
                          {m.original_title}
                        </p>
                      )}
                      <p className="text-xs text-[var(--app-muted)] mt-0.5 truncate">
                        {[
                          tmdbReleaseYear(m.release_date),
                          tmdbGenreNames(m.genre_ids).slice(0, 2).join(", "),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SelectedMovieCard({
  movie,
  onClear,
}: {
  movie: TmdbMovie;
  onClear: () => void;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)]">
      <MoviePoster
        posterPath={movie.poster_path}
        title={movie.title}
        className="w-14 h-20 rounded"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--app-text)] truncate">
          {movie.title || movie.original_title}
        </p>
        {movie.original_title && movie.original_title !== movie.title && (
          <p className="text-xs text-[var(--app-muted)] truncate">
            {movie.original_title}
          </p>
        )}
        <p className="text-xs text-[var(--app-muted)] mt-1 truncate">
          {[
            tmdbReleaseYear(movie.release_date),
            tmdbGenreNames(movie.genre_ids).slice(0, 2).join(", "),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label="선택 해제"
        className="shrink-0 p-1.5 rounded-full text-[var(--app-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-bg)]"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function MoviePoster({
  posterPath,
  title,
  className,
}: {
  posterPath: string | null;
  title: string;
  className?: string;
}) {
  const url = tmdbPosterUrl(posterPath, "w92");
  if (!url) {
    return (
      <div
        className={
          "shrink-0 flex items-center justify-center bg-[var(--app-bg)] border border-[var(--app-border)] " +
          (className ?? "")
        }
        aria-label={`${title} 포스터 없음`}
      >
        <Film className="w-4 h-4 text-[var(--app-muted)]" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`${title} 포스터`}
      loading="lazy"
      className={"shrink-0 object-cover bg-[var(--app-bg)] " + (className ?? "")}
    />
  );
}