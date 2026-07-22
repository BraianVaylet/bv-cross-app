import { useEffect } from 'react';

const APP_NAME = 'BV Agenda';

/**
 * Título de pestaña por pantalla. Importa más de lo que parece: en el
 * cambiador de apps del teléfono y en el historial, todas las pantallas de una
 * SPA se ven iguales si el título nunca cambia.
 */
export function usePageTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} — ${APP_NAME}` : APP_NAME;
  }, [title]);
}
