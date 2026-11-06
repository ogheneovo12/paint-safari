import { ANIMALS_COLLECTION, AnimalColoringItem } from '../data/animals100';

export function getAnimalOutlineUrl(animal: AnimalColoringItem): string {
  return animal.imageUrl;
}

export interface ColoringPage {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  subject: string;
  imageUrl: string;
  magicColorPresets?: { relX: number; relY: number; hex: string }[];
}

export const COLORING_PAGES: ColoringPage[] = [
  {
    id: 'lion',
    title: 'Friendly Lion Cub',
    subtitle: 'Savanna grass, acacia tree & smiling sun',
    emoji: '🦁',
    subject: 'Lion cub sitting on savanna grass',
    imageUrl: '/src/assets/images/lion_coloring_page_1793926926675.jpg',
  },
  {
    id: 'elephant',
    title: 'Happy Elephant',
    subtitle: 'Waterhole, cattail reeds & bright sun',
    emoji: '🐘',
    subject: 'Elephant, waterhole and reeds',
    imageUrl: '/src/assets/images/elephant_coloring_page_1793927438319.jpg',
  },
  {
    id: 'giraffe',
    title: 'Tall Giraffe',
    subtitle: 'Savanna acacia tree & sunny sky',
    emoji: '🦒',
    subject: 'Giraffe, acacia tree',
    imageUrl: '/src/assets/images/giraffe_coloring_page_1793927438333.jpg',
  },
  {
    id: 'zebra',
    title: 'Playful Zebra',
    subtitle: 'Savanna grass tufts & acacia tree',
    emoji: '🦓',
    subject: 'Zebra, grass tufts',
    imageUrl: '/src/assets/images/zebra_coloring_page_1793927440122.jpg',
  },
  {
    id: 'hippo',
    title: 'Splashing Hippo',
    subtitle: 'Water ripples & lily pads',
    emoji: '🦛',
    subject: 'Hippo, water with lily pads',
    imageUrl: '/src/assets/images/hippo_coloring_page_1793927440709.jpg',
  },
  {
    id: 'rhino',
    title: 'Smiling Rhino',
    subtitle: 'Savanna rocks & friendly little bird',
    emoji: '🦏',
    subject: 'Rhino, rocks and a small bird',
    imageUrl: '/src/assets/images/rhino_coloring_page_1793927441674.jpg',
  },
  {
    id: 'meerkat',
    title: 'Alert Meerkat',
    subtitle: 'Burrow entrance & sand mound',
    emoji: '🐾',
    subject: 'Meerkat, burrow and sand mound',
    imageUrl: '/src/assets/images/meerkat_coloring_page_1793927442703.jpg',
  },
  {
    id: 'cheetah',
    title: 'Cheetah Cub',
    subtitle: 'Savanna grass & acacia tree',
    emoji: '🐆',
    subject: 'Cheetah, grass and a tree',
    imageUrl: '/src/assets/images/cheetah_coloring_page_1793927444135.jpg',
  },
  {
    id: 'flamingo',
    title: 'Graceful Flamingo',
    subtitle: 'Shallow water & wetland reeds',
    emoji: '🦩',
    subject: 'Flamingo, shallow water',
    imageUrl: '/src/assets/images/flamingo_coloring_page_1793927444840.jpg',
  },
  {
    id: 'baby-mother-elephant',
    title: 'Baby Elephant & Mother',
    subtitle: 'Mother elephant with her sweet calf',
    emoji: '🐘❤️',
    subject: 'Baby elephant with its mother, grass',
    imageUrl: '/src/assets/images/baby_mother_elephant_1793927445607.jpg',
  },
  {
    id: 'giraffe-eating',
    title: 'Giraffe Snack Time',
    subtitle: 'Eating leaves from an acacia tree',
    emoji: '🦒🌿',
    subject: 'Giraffe eating from a tree',
    imageUrl: '/src/assets/images/giraffe_eating_tree_1793927460247.jpg',
  },
];

export const LION_COLORING_PAGE_IMAGE_URL = COLORING_PAGES[0].imageUrl;

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function hexToRgba(hex: string, alpha = 255): RGBA {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
    a: alpha,
  };
}

/**
 * Checks if a pixel in the outline image is a boundary line (dark).
 */
export function isLinePixel(
  outlineData: Uint8ClampedArray,
  index: number,
  threshold = 120
): boolean {
  // Outline is grayscale black on white
  const r = outlineData[index];
  const g = outlineData[index + 1];
  const b = outlineData[index + 2];
  // Calculate brightness
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < threshold;
}

/**
 * Fast 4-way flood fill algorithm that stays inside black outline borders.
 */
export function floodFill(
  colorData: ImageData,
  outlineData: ImageData,
  startX: number,
  startY: number,
  fillColor: RGBA,
  lineThreshold = 125
): boolean {
  const width = colorData.width;
  const height = colorData.height;
  const cData = colorData.data;
  const oData = outlineData.data;

  startX = Math.floor(startX);
  startY = Math.floor(startY);

  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return false;
  }

  const startIdx = (startY * width + startX) * 4;

  // Don't fill if user clicked directly on an outline line
  if (isLinePixel(oData, startIdx, lineThreshold)) {
    return false;
  }

  const targetR = cData[startIdx];
  const targetG = cData[startIdx + 1];
  const targetB = cData[startIdx + 2];
  const targetA = cData[startIdx + 3];

  // If already the fill color, skip
  if (
    Math.abs(targetR - fillColor.r) < 8 &&
    Math.abs(targetG - fillColor.g) < 8 &&
    Math.abs(targetB - fillColor.b) < 8 &&
    Math.abs(targetA - fillColor.a) < 8
  ) {
    return false;
  }

  // Helper to test if a pixel matches target color and is NOT an outline line
  function canFill(idx: number): boolean {
    if (isLinePixel(oData, idx, lineThreshold)) {
      return false;
    }
    const dr = Math.abs(cData[idx] - targetR);
    const dg = Math.abs(cData[idx + 1] - targetG);
    const db = Math.abs(cData[idx + 2] - targetB);
    const da = Math.abs(cData[idx + 3] - targetA);
    // Allow slight color variation tolerance for previous fills
    return dr + dg + db + da < 50;
  }

  // Queue-based flood fill with visited tracking
  const visited = new Uint8Array(width * height);
  const queue: number[] = [startX, startY];
  visited[startY * width + startX] = 1;

  let head = 0;
  const maxPixels = width * height;

  while (head < queue.length && queue.length < maxPixels) {
    const x = queue[head++];
    const y = queue[head++];
    const idx = (y * width + x) * 4;

    cData[idx] = fillColor.r;
    cData[idx + 1] = fillColor.g;
    cData[idx + 2] = fillColor.b;
    cData[idx + 3] = fillColor.a;

    // 4 neighbors: up, down, left, right
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];

    for (let i = 0; i < 4; i++) {
      const nx = neighbors[i][0];
      const ny = neighbors[i][1];

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nPos = ny * width + nx;
        if (!visited[nPos]) {
          visited[nPos] = 1;
          const nIdx = nPos * 4;
          if (canFill(nIdx)) {
            queue.push(nx, ny);
          }
        }
      }
    }
  }

  return true;
}

/**
 * Kid-friendly color palettes curated for this coloring sheet.
 */
export interface ColorSwatch {
  name: string;
  hex: string;
  textColor?: string;
}

export const SAVANNA_PALETTE: ColorSwatch[] = [
  { name: 'Lion Gold', hex: '#FBBF24', textColor: '#78350F' },
  { name: 'Mane Tawny', hex: '#D97706', textColor: '#FFFFFF' },
  { name: 'Warm Amber', hex: '#F59E0B', textColor: '#78350F' },
  { name: 'Honey Cream', hex: '#FEF08A', textColor: '#78350F' },
  { name: 'Savanna Grass', hex: '#4ADE80', textColor: '#064E3B' },
  { name: 'Jungle Emerald', hex: '#16A34A', textColor: '#FFFFFF' },
  { name: 'Tree Bark', hex: '#854D0E', textColor: '#FFFFFF' },
  { name: 'Sunny Yellow', hex: '#FDE047', textColor: '#78350F' },
  { name: 'Sky Azure', hex: '#38BDF8', textColor: '#0C4A6E' },
  { name: 'Cloud Light Blue', hex: '#BAE6FD', textColor: '#0C4A6E' },
  { name: 'Sunset Orange', hex: '#FB923C', textColor: '#FFFFFF' },
  { name: 'Rose Blush', hex: '#F472B6', textColor: '#FFFFFF' },
  { name: 'Bubblegum Pink', hex: '#EC4899', textColor: '#FFFFFF' },
  { name: 'Berry Purple', hex: '#A855F7', textColor: '#FFFFFF' },
  { name: 'Lavender Mist', hex: '#C084FC', textColor: '#4C1D95' },
  { name: 'Warm Chocolate', hex: '#582F0E', textColor: '#FFFFFF' },
  { name: 'Charcoal Black', hex: '#1F2937', textColor: '#FFFFFF' },
  { name: 'Snow White', hex: '#FFFFFF', textColor: '#1F2937' },
];

export const FUN_STICKERS = [
  { id: 'star', label: '⭐ Star', icon: '⭐' },
  { id: 'heart', label: '💖 Heart', icon: '💖' },
  { id: 'paw', label: '🐾 Paw', icon: '🐾' },
  { id: 'sun', label: '☀️ Sun', icon: '☀️' },
  { id: 'flower', label: '🌸 Flower', icon: '🌸' },
  { id: 'butterfly', label: '🦋 Butterfly', icon: '🦋' },
  { id: 'leaf', label: '🌿 Leaf', icon: '🌿' },
  { id: 'sparkles', label: '✨ Sparkle', icon: '✨' },
];

/**
 * Coordinate presets for instant "Magic Color" auto-fill demo.
 * Based on the 3:4 aspect ratio lion coloring page.
 */
export function getMagicColorPresets(pageId: string): { relX: number; relY: number; hex: string }[] {
  // Shared sky and sun coordinates across the collection
  const baseSkySun = [
    { relX: 0.8, relY: 0.08, hex: '#BAE6FD' },
    { relX: 0.21, relY: 0.13, hex: '#FDE047' },
  ];

  switch (pageId) {
    case 'lion':
      return [
        ...baseSkySun,
        { relX: 0.78, relY: 0.18, hex: '#22C55E' },
        { relX: 0.87, relY: 0.38, hex: '#854D0E' },
        { relX: 0.49, relY: 0.32, hex: '#EA580C' },
        { relX: 0.5, relY: 0.52, hex: '#FBBF24' },
        { relX: 0.5, relY: 0.58, hex: '#FEF3C7' },
        { relX: 0.31, relY: 0.37, hex: '#F472B6' },
        { relX: 0.67, relY: 0.37, hex: '#F472B6' },
        { relX: 0.82, relY: 0.61, hex: '#EA580C' },
        { relX: 0.12, relY: 0.65, hex: '#86EFAC' },
        { relX: 0.88, relY: 0.75, hex: '#86EFAC' },
        { relX: 0.5, relY: 0.95, hex: '#4ADE80' },
      ];

    case 'elephant':
      return [
        ...baseSkySun,
        { relX: 0.5, relY: 0.42, hex: '#94A3B8' }, // Head
        { relX: 0.5, relY: 0.65, hex: '#94A3B8' }, // Body
        { relX: 0.56, relY: 0.56, hex: '#CBD5E1' }, // Trunk
        { relX: 0.27, relY: 0.45, hex: '#FBCFE8' }, // Ear inside
        { relX: 0.72, relY: 0.45, hex: '#FBCFE8' }, // Ear inside
        { relX: 0.88, relY: 0.6, hex: '#38BDF8' }, // Waterhole
        { relX: 0.92, relY: 0.28, hex: '#78350F' }, // Cattail
        { relX: 0.86, relY: 0.28, hex: '#78350F' },
        { relX: 0.88, relY: 0.42, hex: '#16A34A' }, // Reeds grass
        { relX: 0.2, relY: 0.68, hex: '#86EFAC' },
        { relX: 0.5, relY: 0.95, hex: '#4ADE80' },
      ];

    case 'giraffe':
      return [
        ...baseSkySun,
        { relX: 0.82, relY: 0.15, hex: '#22C55E' },
        { relX: 0.88, relY: 0.4, hex: '#854D0E' },
        { relX: 0.58, relY: 0.23, hex: '#FDE047' }, // Head
        { relX: 0.57, relY: 0.4, hex: '#FDE047' }, // Neck
        { relX: 0.45, relY: 0.6, hex: '#FDE047' }, // Body
        { relX: 0.54, relY: 0.38, hex: '#B45309' }, // Spot
        { relX: 0.59, relY: 0.44, hex: '#B45309' }, // Spot
        { relX: 0.52, relY: 0.48, hex: '#B45309' }, // Spot
        { relX: 0.37, relY: 0.57, hex: '#B45309' }, // Spot
        { relX: 0.45, relY: 0.56, hex: '#B45309' }, // Spot
        { relX: 0.52, relY: 0.55, hex: '#B45309' }, // Spot
        { relX: 0.15, relY: 0.68, hex: '#86EFAC' },
        { relX: 0.5, relY: 0.95, hex: '#4ADE80' },
      ];

    case 'zebra':
      return [
        ...baseSkySun,
        { relX: 0.82, relY: 0.15, hex: '#22C55E' },
        { relX: 0.88, relY: 0.4, hex: '#854D0E' },
        { relX: 0.48, relY: 0.52, hex: '#FEF3C7' }, // Muzzle
        { relX: 0.2, relY: 0.68, hex: '#86EFAC' },
        { relX: 0.85, relY: 0.72, hex: '#86EFAC' },
        { relX: 0.5, relY: 0.95, hex: '#4ADE80' },
      ];

    case 'hippo':
      return [
        ...baseSkySun,
        { relX: 0.5, relY: 0.45, hex: '#C084FC' }, // Hippo head
        { relX: 0.55, relY: 0.62, hex: '#C084FC' }, // Hippo body
        { relX: 0.42, relY: 0.68, hex: '#FBCFE8' }, // Belly
        { relX: 0.2, relY: 0.82, hex: '#22C55E' }, // Lilypad
        { relX: 0.8, relY: 0.82, hex: '#22C55E' }, // Lilypad
        { relX: 0.5, relY: 0.85, hex: '#38BDF8' }, // Water
        { relX: 0.15, relY: 0.62, hex: '#60A5FA' }, // Water
      ];

    case 'rhino':
      return [
        ...baseSkySun,
        { relX: 0.8, relY: 0.18, hex: '#22C55E' },
        { relX: 0.88, relY: 0.4, hex: '#854D0E' },
        { relX: 0.62, relY: 0.45, hex: '#94A3B8' }, // Head
        { relX: 0.38, relY: 0.5, hex: '#94A3B8' }, // Body
        { relX: 0.79, relY: 0.45, hex: '#FEF08A' }, // Horn
        { relX: 0.28, relY: 0.76, hex: '#F43F5E' }, // Bird
        { relX: 0.22, relY: 0.88, hex: '#94A3B8' }, // Rock
        { relX: 0.82, relY: 0.88, hex: '#94A3B8' }, // Rock
        { relX: 0.5, relY: 0.95, hex: '#4ADE80' },
      ];

    case 'meerkat':
      return [
        ...baseSkySun,
        { relX: 0.5, relY: 0.3, hex: '#F59E0B' }, // Head
        { relX: 0.5, relY: 0.55, hex: '#F59E0B' }, // Body
        { relX: 0.5, relY: 0.48, hex: '#FEF3C7' }, // Chest
        { relX: 0.5, relY: 0.78, hex: '#D97706' }, // Mound
        { relX: 0.2, relY: 0.65, hex: '#86EFAC' },
        { relX: 0.5, relY: 0.95, hex: '#4ADE80' },
      ];

    case 'cheetah':
      return [
        ...baseSkySun,
        { relX: 0.8, relY: 0.18, hex: '#22C55E' },
        { relX: 0.88, relY: 0.4, hex: '#854D0E' },
        { relX: 0.5, relY: 0.48, hex: '#FBBF24' }, // Head
        { relX: 0.5, relY: 0.68, hex: '#FBBF24' }, // Body
        { relX: 0.48, relY: 0.68, hex: '#FEF3C7' }, // Chest
        { relX: 0.15, relY: 0.68, hex: '#86EFAC' },
        { relX: 0.5, relY: 0.95, hex: '#4ADE80' },
      ];

    case 'flamingo':
      return [
        ...baseSkySun,
        { relX: 0.68, relY: 0.24, hex: '#F472B6' }, // Head
        { relX: 0.62, relY: 0.36, hex: '#F472B6' }, // Neck
        { relX: 0.5, relY: 0.5, hex: '#F472B6' }, // Body
        { relX: 0.42, relY: 0.52, hex: '#EC4899' }, // Wing
        { relX: 0.5, relY: 0.7, hex: '#FB7185' }, // Leg
        { relX: 0.15, relY: 0.52, hex: '#78350F' }, // Reeds
        { relX: 0.85, relY: 0.52, hex: '#78350F' },
        { relX: 0.18, relY: 0.75, hex: '#16A34A' },
        { relX: 0.82, relY: 0.75, hex: '#16A34A' },
        { relX: 0.5, relY: 0.88, hex: '#38BDF8' }, // Water
      ];

    case 'baby-mother-elephant':
      return [
        ...baseSkySun,
        { relX: 0.8, relY: 0.18, hex: '#22C55E' },
        { relX: 0.88, relY: 0.4, hex: '#854D0E' },
        { relX: 0.4, relY: 0.44, hex: '#94A3B8' }, // Mother
        { relX: 0.3, relY: 0.58, hex: '#94A3B8' },
        { relX: 0.68, relY: 0.72, hex: '#CBD5E1' }, // Baby
        { relX: 0.15, relY: 0.68, hex: '#86EFAC' },
        { relX: 0.5, relY: 0.95, hex: '#4ADE80' },
      ];

    case 'giraffe-eating':
      return [
        ...baseSkySun,
        { relX: 0.78, relY: 0.16, hex: '#22C55E' }, // Tree
        { relX: 0.88, relY: 0.4, hex: '#854D0E' },
        { relX: 0.67, relY: 0.32, hex: '#16A34A' }, // Leaves in mouth
        { relX: 0.52, relY: 0.35, hex: '#FDE047' }, // Head
        { relX: 0.5, relY: 0.5, hex: '#FDE047' }, // Neck
        { relX: 0.5, relY: 0.68, hex: '#FDE047' }, // Body
        { relX: 0.48, relY: 0.42, hex: '#B45309' }, // Spot
        { relX: 0.48, relY: 0.58, hex: '#B45309' }, // Spot
        { relX: 0.15, relY: 0.68, hex: '#86EFAC' },
        { relX: 0.5, relY: 0.95, hex: '#4ADE80' },
      ];

    default: {
      const animal = ANIMALS_COLLECTION.find((a) => a.id === pageId);
      if (animal) {
        return [
          ...baseSkySun,
          { relX: 0.5, relY: 0.45, hex: animal.bodyColor }, // Head
          { relX: 0.5, relY: 0.65, hex: animal.bodyColor }, // Body
          { relX: 0.5, relY: 0.72, hex: animal.accentColor || '#FEF3C7' }, // Belly / Chest
          { relX: 0.85, relY: 0.22, hex: '#22C55E' }, // Tree canopy
          { relX: 0.88, relY: 0.42, hex: '#854D0E' }, // Tree trunk
          { relX: 0.15, relY: 0.68, hex: '#86EFAC' }, // Grass tuft
          { relX: 0.5, relY: 0.95, hex: '#4ADE80' }, // Ground savanna
        ];
      }
      return baseSkySun;
    }
  }
}

export const MAGIC_COLOR_PRESETS = getMagicColorPresets('lion');

