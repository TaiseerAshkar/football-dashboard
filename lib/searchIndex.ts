import type { SearchIndex } from "@/lib/searchTypes";

// Loads the team index once per page visit and shares it between the search box
// and the favourite-team card. A failed load is forgotten so it can be retried.
let loading: Promise<SearchIndex> | null = null;

export function loadIndex(): Promise<SearchIndex> {
  if (!loading) {
    loading = fetch("/api/search")
      .then((res) => {
        if (!res.ok) throw new Error("Could not load teams");
        return res.json() as Promise<SearchIndex>;
      })
      .catch((e) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}
