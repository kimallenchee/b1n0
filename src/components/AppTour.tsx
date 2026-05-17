/**
 * AppTour — single Joyride mount that owns the Cómo Jugar walkthrough.
 *
 * Subscribes to TourContext; renders nothing when the tour isn't
 * running. When the user starts the tour from TopBar (or anywhere
 * else), Joyride takes over: dims the page, highlights the targeted
 * element, shows a tooltip with the step's title + body, and
 * advances on Siguiente.
 *
 * Styling: matches b1n0 brand tokens (--b1n0-card background,
 * --b1n0-si accent for the next button, Inter typography). Joyride
 * exposes a `styles` prop so we don't need to wrestle with CSS.
 *
 * Multi-page note: v1 ONLY runs on /inicio. Pasos that target
 * elements outside of /inicio (e.g. data-tour="nav-portafolio")
 * still work because the bottom nav / desktop dock is visible on
 * every route. If a step targets an element that isn't in the DOM,
 * Joyride skips it silently — safer than crashing.
 */

import { lazy, Suspense } from 'react'
import type { CallBackProps } from 'react-joyride'
import { useTour } from '../context/TourContext'
import { TUTORIAL_STEPS, TUTORIAL_LOCALE } from '../content/tutorial'

// Lazy-load Joyride — it's ~30KB and only needed when the user
// actually opens the tour. Keeps the initial bundle slim.
//
// IMPORTANT: react-joyride v2 has NO default export — it exports
// `Joyride` as a named export only. React.lazy requires a default
// export, so we adapt with `.then(m => ({ default: m.Joyride }))`.
// Without this shim, lazy() resolves to `undefined` and React
// crashes trying to render it (silent: just shows ErrorBoundary).
const Joyride = lazy(() =>
  import('react-joyride').then((m) => ({ default: m.Joyride }))
)

export function AppTour() {
  const { running, stopTour } = useTour()

  // Don't even load the Joyride bundle until first run.
  if (!running) return null

  return (
    <Suspense fallback={null}>
      <Joyride
        steps={TUTORIAL_STEPS}
        run={running}
        continuous
        showSkipButton
        showProgress
        locale={TUTORIAL_LOCALE}
        callback={(data: CallBackProps) => {
          // 'finished' = user reached the last step + clicked Listo
          // 'skipped'  = user hit the Saltar button
          // 'error:target_not_found' = tour element missing; rare,
          //              but possible if the user opened the tour
          //              on a route that doesn't have the target.
          //              We just stop instead of crashing.
          if (
            data.status === 'finished' ||
            data.status === 'skipped' ||
            data.type === 'error:target_not_found'
          ) {
            stopTour()
          }
        }}
        styles={{
          options: {
            // Brand-tuned palette
            primaryColor:    'var(--b1n0-si)',
            backgroundColor: 'var(--b1n0-card)',
            textColor:       'var(--b1n0-text-1)',
            arrowColor:      'var(--b1n0-card)',
            overlayColor:    'rgba(0, 0, 0, 0.55)',
            zIndex:          10000,
          },
          tooltip: {
            borderRadius: 'var(--radius-lg)',
            padding:      '20px',
            fontFamily:   'var(--font-body)',
            maxWidth:     '380px',
          },
          tooltipTitle: {
            fontFamily:    'var(--font-display)',
            fontWeight:    700,
            fontSize:      '18px',
            letterSpacing: '-0.5px',
            marginBottom:  '8px',
            color:         'var(--b1n0-text-1)',
          },
          tooltipContent: {
            fontSize:   '14px',
            lineHeight: 1.55,
            color:      'var(--b1n0-muted)',
            padding:    '4px 0 8px',
          },
          buttonNext: {
            backgroundColor: 'var(--b1n0-si)',
            color:           'var(--b1n0-on-accent)',
            borderRadius:    'var(--radius-pill)',
            fontFamily:      'var(--font-body)',
            fontWeight:      600,
            fontSize:        '13px',
            padding:         '8px 16px',
          },
          buttonBack: {
            color:      'var(--b1n0-muted)',
            fontFamily: 'var(--font-body)',
            fontSize:   '13px',
            marginRight: '8px',
          },
          buttonSkip: {
            color:      'var(--b1n0-muted)',
            fontFamily: 'var(--font-body)',
            fontSize:   '12px',
          },
          buttonClose: {
            color: 'var(--b1n0-muted)',
          },
        }}
      />
    </Suspense>
  )
}
