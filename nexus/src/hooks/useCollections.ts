import * as React from "react";
import { useCollectionStore, refreshCollections } from "@/stores/collectionStore";

export function useCollections() {
  const collections = useCollectionStore((s) => s.collections);
  const isLoading = useCollectionStore((s) => s.isLoading);
  const setLoading = useCollectionStore((s) => s.setLoading);
  const [error, setError] = React.useState<string | null>(null);
  const loaded = React.useRef(false);

  React.useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    setLoading(true);
    refreshCollections()
      .then(() => setLoading(false))
      .catch((err) => {
        console.error("Failed to load collections:", err);
        setError(err?.message ?? "Failed to load collections");
        setLoading(false);
      });
  }, [setLoading]);

  return { collections, isLoading, error };
}
