import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCollectionStore, type Collection } from "@/stores/collectionStore";

interface BackendCollection {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isSmart: boolean;
  rulesJson: string | null;
  gameIds: string[];
}

export function useCollections() {
  const collections = useCollectionStore((s) => s.collections);
  const isLoading = useCollectionStore((s) => s.isLoading);
  const setCollections = useCollectionStore((s) => s.setCollections);
  const setLoading = useCollectionStore((s) => s.setLoading);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (collections.length > 0 || error) return;

    let cancelled = false;
    setLoading(true);

    invoke<BackendCollection[]>("get_collections_with_game_ids")
      .then((rows) => {
        if (cancelled) return;

        const mapped: Collection[] = rows.map((row) => ({
          id: row.id,
          name: row.name,
          icon: row.icon ?? "",
          color: row.color,
          sortOrder: row.sortOrder,
          isSmart: row.isSmart,
          rulesJson: row.rulesJson,
          gameIds: row.gameIds,
        }));

        setCollections(mapped);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load collections:", err);
          setError(err?.message ?? "Failed to load collections");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [collections.length, error, setCollections, setLoading]);

  return { collections, isLoading, error };
}
