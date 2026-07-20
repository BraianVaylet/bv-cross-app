// Imágenes demostrativas por ejercicio (v1). El catálogo puede traer su propia
// imageUrl; este mapa es el fallback por nombre normalizado (F2-05 formaliza
// la cascada imageUrl → mapa local → placeholder).

const BY_NAME: Record<string, string> = {
  'back sq': '/exercises/back-sq.webp',
  'front sq': '/exercises/front-sq-clean.webp',
  clean: '/exercises/front-sq-clean.webp',
  snatch: '/exercises/snatch.webp',
  'split jerk': '/exercises/split-jerk.webp',
  dl: '/exercises/dl.webp',
  'push press': '/exercises/push-press.webp',
  'press militar': '/exercises/press-militar.webp',
  'floor press': '/exercises/floor-press.webp',
  'hip thrust': '/exercises/hip-thrust.webp',
  thruster: '/exercises/thruster.webp',
};

/** URL de la imagen demostrativa: la del catálogo, el mapa local, o null. */
export function exerciseImage(name: string, imageUrl?: string): string | null {
  return imageUrl ?? BY_NAME[name.trim().toLowerCase()] ?? null;
}
