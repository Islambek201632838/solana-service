import { useState, useEffect } from "react";

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

export function useBreakpoint() {
  const isMobile = !useMediaQuery("(min-width: 768px)");
  const isTablet = useMediaQuery("(min-width: 768px)") && !useMediaQuery("(min-width: 1024px)");
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  return { isMobile, isTablet, isDesktop };
}
