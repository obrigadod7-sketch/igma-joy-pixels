import { useEffect } from "react";

/**
 * DebugErrorThrower
 *
 * Sem UI. Escuta o evento global "lovable-debug-error" e registra a
 * instrução no console para debug, sem quebrar a tela do aplicativo.
 */
export const DebugErrorThrower = () => {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail !== "string" || detail.length === 0) return;
      console.error(detail);
    };
    window.addEventListener("lovable-debug-error", handler as EventListener);
    return () => window.removeEventListener("lovable-debug-error", handler as EventListener);
  }, []);

  return null;
};
