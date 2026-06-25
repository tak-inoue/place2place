export interface PlaceColor {
  id: string;
  name: string;
  hex: string;
  hue: number;        // 0〜360 hue angle
  chroma: number;     // chroma (0〜100)
  lightness: number;  // lightness (0〜100)
  family: string;
  tone: string;
  textColor: string;  // Text color for readability (#ffffff or #1c1917)
}

export const PLACE_COLORS: PlaceColor[] = [
  // Sand
  { id: 'pale-sand', name: 'Pale Sand', hex: '#f5ebe0', hue: 33, chroma: 8, lightness: 92, family: 'sand', tone: 'pale', textColor: '#1c1917' },
  { id: 'soft-sand', name: 'Soft Sand', hex: '#e3d5ca', hue: 30, chroma: 11, lightness: 83, family: 'sand', tone: 'soft', textColor: '#1c1917' },
  { id: 'muted-sand', name: 'Muted Sand', hex: '#d5bdaf', hue: 22, chroma: 13, lightness: 76, family: 'sand', tone: 'muted', textColor: '#1c1917' },
  { id: 'deep-sand', name: 'Deep Sand', hex: '#a38069', hue: 24, chroma: 22, lightness: 53, family: 'sand', tone: 'deep', textColor: '#ffffff' },
  // Terracotta
  { id: 'pale-terracotta', name: 'Pale Terracotta', hex: '#fbe9e7', hue: 14, chroma: 6, lightness: 94, family: 'terracotta', tone: 'pale', textColor: '#1c1917' },
  { id: 'soft-terracotta', name: 'Soft Terracotta', hex: '#ffccbc', hue: 14, chroma: 25, lightness: 86, family: 'terracotta', tone: 'soft', textColor: '#1c1917' },
  { id: 'muted-terracotta', name: 'Muted Terracotta', hex: '#e0a996', hue: 16, chroma: 28, lightness: 73, family: 'terracotta', tone: 'muted', textColor: '#1c1917' },
  { id: 'deep-terracotta', name: 'Deep Terracotta', hex: '#b85d43', hue: 13, chroma: 48, lightness: 49, family: 'terracotta', tone: 'deep', textColor: '#ffffff' },
  // Amber
  { id: 'pale-amber', name: 'Pale Amber', hex: '#fff8e1', hue: 45, chroma: 8, lightness: 95, family: 'amber', tone: 'pale', textColor: '#1c1917' },
  { id: 'soft-amber', name: 'Soft Amber', hex: '#ffe082', hue: 45, chroma: 48, lightness: 85, family: 'amber', tone: 'soft', textColor: '#1c1917' },
  { id: 'muted-amber', name: 'Muted Amber', hex: '#dcb873', hue: 42, chroma: 40, lightness: 68, family: 'amber', tone: 'muted', textColor: '#1c1917' },
  { id: 'deep-amber', name: 'Deep Amber', hex: '#a37c3f', hue: 38, chroma: 46, lightness: 51, family: 'amber', tone: 'deep', textColor: '#ffffff' },
  // Sage
  { id: 'pale-sage', name: 'Pale Sage', hex: '#f1f5f0', hue: 96, chroma: 4, lightness: 95, family: 'sage', tone: 'pale', textColor: '#1c1917' },
  { id: 'soft-sage', name: 'Soft Sage', hex: '#c8d6c5', hue: 104, chroma: 11, lightness: 81, family: 'sage', tone: 'soft', textColor: '#1c1917' },
  { id: 'muted-sage', name: 'Muted Sage', hex: '#9db499', hue: 108, chroma: 16, lightness: 69, family: 'sage', tone: 'muted', textColor: '#1c1917' },
  { id: 'deep-sage', name: 'Deep Sage', hex: '#637a60', hue: 113, chroma: 21, lightness: 43, family: 'sage', tone: 'deep', textColor: '#ffffff' },
  // Mint
  { id: 'pale-mint', name: 'Pale Mint', hex: '#eef8f6', hue: 168, chroma: 4, lightness: 96, family: 'mint', tone: 'pale', textColor: '#1c1917' },
  { id: 'soft-mint', name: 'Soft Mint', hex: '#b2dfdb', hue: 171, chroma: 25, lightness: 82, family: 'mint', tone: 'soft', textColor: '#1c1917' },
  { id: 'muted-mint', name: 'Muted Mint', hex: '#80cbc4', hue: 174, chroma: 32, lightness: 70, family: 'mint', tone: 'muted', textColor: '#1c1917' },
  { id: 'deep-mint', name: 'Deep Mint', hex: '#00796b', hue: 174, chroma: 45, lightness: 43, family: 'mint', tone: 'deep', textColor: '#ffffff' },
  // Sky
  { id: 'pale-sky', name: 'Pale Sky', hex: '#e1f5fe', hue: 198, chroma: 8, lightness: 94, family: 'sky', tone: 'pale', textColor: '#1c1917' },
  { id: 'soft-sky', name: 'Soft Sky', hex: '#b3e5fc', hue: 200, chroma: 25, lightness: 83, family: 'sky', tone: 'soft', textColor: '#1c1917' },
  { id: 'muted-sky', name: 'Muted Sky', hex: '#7cc3e8', hue: 201, chroma: 34, lightness: 70, family: 'sky', tone: 'muted', textColor: '#1c1917' },
  { id: 'deep-sky', name: 'Deep Sky', hex: '#2980b9', hue: 203, chroma: 55, lightness: 45, family: 'sky', tone: 'deep', textColor: '#ffffff' },
  // Navy
  { id: 'pale-navy', name: 'Pale Navy', hex: '#e8ecf2', hue: 216, chroma: 6, lightness: 93, family: 'navy', tone: 'pale', textColor: '#1c1917' },
  { id: 'soft-navy', name: 'Soft Navy', hex: '#9faebd', hue: 210, chroma: 16, lightness: 68, family: 'navy', tone: 'soft', textColor: '#1c1917' },
  { id: 'muted-navy', name: 'Muted Navy', hex: '#5c6f84', hue: 212, chroma: 18, lightness: 44, family: 'navy', tone: 'muted', textColor: '#ffffff' },
  { id: 'deep-navy', name: 'Deep Navy', hex: '#1a365d', hue: 215, chroma: 36, lightness: 23, family: 'navy', tone: 'deep', textColor: '#ffffff' },
  // Lavender
  { id: 'pale-lavender', name: 'Pale Lavender', hex: '#f3e5f5', hue: 291, chroma: 6, lightness: 94, family: 'lavender', tone: 'pale', textColor: '#1c1917' },
  { id: 'soft-lavender', name: 'Soft Lavender', hex: '#e1bee7', hue: 291, chroma: 16, lightness: 83, family: 'lavender', tone: 'soft', textColor: '#1c1917' },
  { id: 'muted-lavender', name: 'Muted Lavender', hex: '#ce93d8', hue: 291, chroma: 27, lightness: 71, family: 'lavender', tone: 'muted', textColor: '#1c1917' },
  { id: 'deep-lavender', name: 'Deep Lavender', hex: '#7b1fa2', hue: 282, chroma: 52, lightness: 38, family: 'lavender', tone: 'deep', textColor: '#ffffff' },
  // Charcoal
  { id: 'pale-charcoal', name: 'Pale Charcoal', hex: '#f4f4f5', hue: 240, chroma: 1, lightness: 96, family: 'charcoal', tone: 'pale', textColor: '#1c1917' },
  { id: 'soft-charcoal', name: 'Soft Charcoal', hex: '#d4d4d8', hue: 240, chroma: 2, lightness: 83, family: 'charcoal', tone: 'soft', textColor: '#1c1917' },
  { id: 'muted-charcoal', name: 'Muted Charcoal', hex: '#71717a', hue: 240, chroma: 3, lightness: 46, family: 'charcoal', tone: 'muted', textColor: '#ffffff' },
  { id: 'deep-charcoal', name: 'Deep Charcoal', hex: '#27272a', hue: 240, chroma: 2, lightness: 16, family: 'charcoal', tone: 'deep', textColor: '#ffffff' }
];
