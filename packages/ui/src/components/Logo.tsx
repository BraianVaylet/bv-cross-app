/* Marca inline (no <img>) para que se adapte a ambos temas:
   el naranja queda como acento fijo y las partes claras usan
   currentColor (= text-ink: oscuro en claro, claro en oscuro).
   - size="lg" → wordmark completo "BV cross" (login)
   - size="md" → versión compacta "BV" + ícono (header) */

const ICON_FULL =
  'M 206.771 -24.619 L 206.771 -30.382 C 206.771 -37.626 200.758 -43.554 193.408 -43.554 C 186.059 -43.554 180.045 -37.626 180.045 -30.382 L 180.045 -24.619 C 176.871 -21.326 175.034 -17.046 175.034 -12.271 C 175.034 -6.508 177.707 -1.24 182.384 2.218 C 182.718 2.382 183.052 2.547 183.386 2.547 L 203.431 2.547 C 203.765 2.547 204.099 2.382 204.433 2.218 C 209.11 -1.24 211.783 -6.508 211.783 -12.271 C 211.783 -17.046 209.945 -21.491 206.771 -24.619 Z M 183.386 -27.418 L 183.386 -30.382 C 183.386 -35.815 187.896 -40.261 193.408 -40.261 C 198.921 -40.261 203.431 -35.815 203.431 -30.382 L 203.431 -27.418 C 200.591 -29.229 197.083 -30.382 193.408 -30.382 C 189.733 -30.382 186.226 -29.229 183.386 -27.418 Z M 203.431 -13.753 C 203.264 -13.753 203.097 -13.753 202.93 -13.753 C 202.261 -13.753 201.593 -14.247 201.259 -14.905 C 200.758 -16.716 199.422 -18.198 197.918 -19.186 C 197.083 -19.68 196.916 -20.668 197.417 -21.491 C 197.918 -22.314 198.921 -22.479 199.756 -21.985 C 201.927 -20.503 203.598 -18.363 204.433 -15.893 C 204.767 -14.905 204.266 -14.082 203.431 -13.753 Z';

const ICON_MINI =
  'M 404.324 78.956 L 404.324 73.193 C 404.324 65.949 398.311 60.021 390.961 60.021 C 383.612 60.021 377.598 65.949 377.598 73.193 L 377.598 78.956 C 374.424 82.249 372.587 86.529 372.587 91.304 C 372.587 97.067 375.26 102.335 379.937 105.793 C 380.271 105.957 380.605 106.122 380.939 106.122 L 400.984 106.122 C 401.318 106.122 401.652 105.957 401.986 105.793 C 406.663 102.335 409.336 97.067 409.336 91.304 C 409.336 86.529 407.498 82.084 404.324 78.956 Z M 380.939 76.157 L 380.939 73.193 C 380.939 67.76 385.449 63.314 390.961 63.314 C 396.474 63.314 400.984 67.76 400.984 73.193 L 400.984 76.157 C 398.144 74.346 394.636 73.193 390.961 73.193 C 387.286 73.193 383.779 74.346 380.939 76.157 Z M 400.984 89.822 C 400.817 89.822 400.65 89.822 400.483 89.822 C 399.814 89.822 399.146 89.328 398.812 88.67 C 398.311 86.859 396.975 85.377 395.471 84.389 C 394.636 83.895 394.469 82.907 394.97 82.084 C 395.471 81.261 396.474 81.096 397.309 81.59 C 399.48 83.072 401.151 85.212 401.986 87.682 C 402.32 88.67 401.819 89.493 400.984 89.822 Z';

/**
 * `label` sirve a las apps hermanas (BV Agenda, CRM): la marca es la misma
 * familia, pero el lector de pantalla tiene que nombrar la app correcta.
 * El wordmark completo (`size="lg"`) dice "BV cross": las otras apps usan
 * el compacto.
 */
export function Logo({ size = 'md', label = 'BV Cross' }: { size?: 'md' | 'lg'; label?: string }) {
  if (size === 'lg') {
    return (
      <svg
        role="img"
        aria-label={label}
        viewBox="0 0 233.631 116.089"
        className="h-14 w-auto text-ink"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g transform="matrix(1, 0, 0, 1, -36.871506, 86.201118)">
          <text
            x="44.581"
            y="2.011"
            fontFamily="Chewy, system-ui, sans-serif"
            fontSize="90"
            letterSpacing="-4"
            style={{ whiteSpace: 'pre', fill: 'var(--color-accent)' }}
          >
            BV
          </text>
          <text
            x="125"
            y="0"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="60"
            fontWeight={700}
            letterSpacing="-3"
            style={{ whiteSpace: 'pre', fill: 'currentColor' }}
          >
            cr   ss
          </text>
          <path d={ICON_FULL} style={{ fillRule: 'nonzero', fill: 'var(--color-accent)' }} />
        </g>
      </svg>
    );
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 128.38 113.743"
      className="h-9 w-auto text-ink"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="matrix(1, 0, 0, 1, -290.279327, -18.100559)">
        <text
          x="296.772"
          y="104.916"
          fontFamily="Chewy, system-ui, sans-serif"
          fontSize="90"
          letterSpacing="-4"
          style={{ whiteSpace: 'pre', fill: 'var(--color-accent)' }}
        >
          BV
        </text>
        <path d={ICON_MINI} style={{ fillRule: 'nonzero', fill: 'currentColor' }} />
      </g>
    </svg>
  );
}
