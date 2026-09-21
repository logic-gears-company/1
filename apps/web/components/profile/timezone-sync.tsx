"use client";

import { useEffect } from "react";
import { syncTimezoneOnce } from "@/lib/profile/tz-sync";

/**
 * Sin UI. Al montarse en el área autenticada, comunica al servidor la zona
 * horaria del navegador (una vez por pestaña). Ver lib/profile/tz-sync.ts.
 * El servidor decide si la guarda; nunca pisa una zona elegida por el usuario.
 */
export function TimezoneSync() {
  useEffect(() => {
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { storage = null; }
    void syncTimezoneOnce({ storage });
  }, []);
  return null;
}
