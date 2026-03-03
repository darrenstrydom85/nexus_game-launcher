import * as React from "react";

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = React.useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  React.useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}

export function getOfflineFallback(feature: string): string {
  const messages: Record<string, string> = {
    metadata: "Metadata unavailable offline. Will retry when connected.",
    verification: "No internet connection. Try again later.",
    trailer: "Offline — trailer unavailable",
  };
  return messages[feature] ?? "This feature requires an internet connection.";
}
