/**
 * Tour interactivo de b1n0 — fuente única para los pasos del walkthrough.
 *
 * Editar el copy acá NO requiere tocar el componente AppTour.tsx.
 * Cada paso apunta a un elemento real del DOM vía `target` (selector
 * CSS, normalmente un `[data-tour="..."]`). El componente lo destaca,
 * muestra el tooltip y avanza al siguiente.
 *
 * Reglas de tono (mismas que documentation.ts):
 *   - Voseo centroamericano (hacés, sabés, llamado, cobrás).
 *   - Sin lenguaje de casino o apuestas (ver brandbook + CLAUDE.md).
 *   - Una idea por paso. Cada paso = una cosa que aprendés.
 *
 * Diseño v1: tour de una sola página (corre sobre /inicio). Pasos
 * multi-ruta vendrán en v2 cuando el manejo de navegación entre
 * pasos esté probado.
 */

import type { Step } from 'react-joyride'

export const TUTORIAL_STEPS: Step[] = [
  // ──────────────────────────────────────────────────────────
  // 1. Bienvenida — modal centrado, sin target.
  // ──────────────────────────────────────────────────────────
  {
    target: 'body',
    placement: 'center',
    title: 'Bienvenido a b1n0',
    content:
      'Acá demostrás que sabés más que todos. Te muestro en 30 segundos cómo funciona — toca Siguiente cuando quieras avanzar.',
    disableBeacon: true,
  },

  // ──────────────────────────────────────────────────────────
  // 2. EventCard — la unidad básica de la plataforma.
  // ──────────────────────────────────────────────────────────
  {
    target: '[data-tour="event-card"]',
    placement: 'bottom',
    title: 'Esto es un llamado',
    content:
      'Cada tarjeta es un evento real del mundo. Una pregunta, dos lados, una fecha de resolución. Hacés tu llamado en el que creés.',
    disableBeacon: true,
  },

  // ──────────────────────────────────────────────────────────
  // 3. SplitBar — la barra de distribución Y el punto de entrada.
  //    Una sola idea: la barra muestra cómo va la opinión, y
  //    también es donde tocás para entrar (SÍ a la izquierda,
  //    NO a la derecha). Antes hicimos dos pasos para esto pero
  //    se sentía redundante — el split bar es la entrada.
  // ──────────────────────────────────────────────────────────
  {
    target: '[data-tour="split-bar"]',
    placement: 'top',
    title: 'La barra es todo',
    content:
      'Muestra cómo está dividida la opinión en tiempo real, y también es donde entrás: tocá el lado SÍ o el lado NO para hacer tu llamado. Vas a ver el costo y el cobro estimado antes de confirmar.',
    disableBeacon: true,
  },

  // ──────────────────────────────────────────────────────────
  // 5. Perfil — gateway a Mi Portafolio + saldo + configuración.
  //    Target: el aria-label="Perfil" del DockButton (desktop dock)
  //    o el equivalente en mobile. Funciona sin tocar el componente
  //    DockButton (no acepta data attrs arbitrarios).
  // ──────────────────────────────────────────────────────────
  {
    target: '[aria-label="Perfil"]',
    placement: 'top',
    title: 'Tu cuenta',
    content:
      'Desde acá llegás a Mi Portafolio (todos tus llamados activos con P&L en vivo), tu saldo, y la configuración de la cuenta.',
    disableBeacon: true,
  },

  // ──────────────────────────────────────────────────────────
  // 6. Final — call to action.
  // ──────────────────────────────────────────────────────────
  {
    target: 'body',
    placement: 'center',
    title: 'Listo. Hacé tu primer llamado.',
    content:
      'Eso es todo lo que necesitás saber para empezar. Si querés profundizar — comisiones, cómo se calcula el cobro, qué pasa si nadie llama del otro lado — todo está en Documentación.',
    disableBeacon: true,
  },
]

/**
 * Localización al español de los botones del tour. Joyride usa
 * inglés por defecto; sobreescribimos para que combine con la voz
 * del producto.
 */
export const TUTORIAL_LOCALE = {
  back: 'Atrás',
  close: 'Cerrar',
  last: 'Listo',
  next: 'Siguiente',
  open: 'Abrir guía',
  skip: 'Saltar',
}
