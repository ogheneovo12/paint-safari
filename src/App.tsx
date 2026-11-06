/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  PaintBucket,
  Brush,
  Eraser,
  Printer,
  Download,
  Sparkles,
  RotateCcw,
  RotateCw,
  Trash2,
  Volume2,
  VolumeX,
  Palette,
  Check,
  ZoomIn,
  ZoomOut,
  Info,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Search,
  Grid,
  X,
} from 'lucide-react';
import {
  ANIMALS_COLLECTION,
  CATEGORIES,
  AnimalColoringItem,
} from './data/animals100';
import {
  SAVANNA_PALETTE,
  FUN_STICKERS,
  getAnimalOutlineUrl,
  getMagicColorPresets,
  hexToRgba,
  floodFill,
  RGBA,
} from './utils/coloringEngine';
import {
  playPop,
  playSplat,
  playStamp,
  playSparkle,
  playCheer,
  toggleSound,
} from './utils/sound';

type Tool = 'bucket' | 'brush' | 'crayon' | 'eraser' | 'sticker';

interface StickerItem {
  id: number;
  sticker: string;
  x: number;
  y: number;
  size: number;
}

interface SavedPageState {
  colorImageData: ImageData | null;
  stickers: StickerItem[];
}

export default function App() {
  // References
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outlineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // States
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>('lion');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showCatalogModal, setShowCatalogModal] = useState<boolean>(false);
  const [selectedTool, setSelectedTool] = useState<Tool>('bucket');
  const [selectedColor, setSelectedColor] = useState<string>('#FBBF24');
  const [brushSize, setBrushSize] = useState<number>(24);
  const [selectedSticker, setSelectedSticker] = useState<string>('⭐');
  const [soundOn, setSoundOn] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [outlineLoaded, setOutlineLoaded] = useState<boolean>(false);
  const [keepLinesOnTop, setKeepLinesOnTop] = useState<boolean>(true);
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [stickersHistory, setStickersHistory] = useState<StickerItem[][]>([]);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [printScope, setPrintScope] = useState<'current_clean' | 'current_colored' | 'category_booklet' | 'all_100'>('current_clean');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Per-page canvas persistence across all 100 pages
  const pagesStateRef = useRef<Record<string, SavedPageState>>({});

  // Undo / Redo stacks
  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Drawing state
  const isDrawingRef = useRef<boolean>(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const currentAnimal = useMemo(() => {
    return ANIMALS_COLLECTION.find((a) => a.id === selectedAnimalId) || ANIMALS_COLLECTION[0];
  }, [selectedAnimalId]);

  const currentAnimalIndex = useMemo(() => {
    return ANIMALS_COLLECTION.findIndex((a) => a.id === selectedAnimalId);
  }, [selectedAnimalId]);

  // Filtered animals list for search and categories
  const filteredAnimals = useMemo(() => {
    return ANIMALS_COLLECTION.filter((item) => {
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const matchesSearch =
        searchQuery.trim() === '' ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(item.number) === searchQuery.trim();
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  // Compact carousel: first 20 animals + current animal if outside top 20, with +80 more catalogue trigger
  const CAROUSEL_LIMIT = 20;
  const carouselAnimals = useMemo(() => {
    const base = ANIMALS_COLLECTION.slice(0, CAROUSEL_LIMIT);
    if (currentAnimalIndex >= CAROUSEL_LIMIT && !base.some((a) => a.id === currentAnimal.id)) {
      return [...base, currentAnimal];
    }
    return base;
  }, [currentAnimalIndex, currentAnimal]);

  const remainingCarouselCount = useMemo(() => {
    return Math.max(0, ANIMALS_COLLECTION.length - carouselAnimals.length);
  }, [carouselAnimals.length]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  const handleToggleSound = () => {
    const nextState = toggleSound();
    setSoundOn(nextState);
    if (nextState) playPop();
  };

  // Re-composite all layers onto display canvas
  const renderDisplay = useCallback(() => {
    const displayCanvas = displayCanvasRef.current;
    const colorCanvas = colorCanvasRef.current;
    const outlineCanvas = outlineCanvasRef.current;
    if (!displayCanvas || !colorCanvas || !outlineCanvas) return;

    const ctx = displayCanvas.getContext('2d');
    if (!ctx) return;

    const width = displayCanvas.width;
    const height = displayCanvas.height;

    ctx.clearRect(0, 0, width, height);

    if (keepLinesOnTop) {
      // 1. Painted colors layer
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(colorCanvas, 0, 0);

      // 2. Black outline on top using multiply so borders stay 100% crisp
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(outlineCanvas, 0, 0);

      // 3. Stickers
      ctx.globalCompositeOperation = 'source-over';
      drawStickers(ctx);
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(outlineCanvas, 0, 0);
      ctx.drawImage(colorCanvas, 0, 0);
      drawStickers(ctx);
    }
  }, [keepLinesOnTop, stickers]);

  const drawStickers = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const item of stickers) {
      ctx.font = `${item.size}px sans-serif`;
      ctx.fillText(item.sticker, item.x, item.y);
    }
    ctx.restore();
  };

  const pushState = () => {
    const colorCanvas = colorCanvasRef.current;
    if (!colorCanvas) return;
    const ctx = colorCanvas.getContext('2d');
    if (!ctx) return;

    const data = ctx.getImageData(0, 0, colorCanvas.width, colorCanvas.height);
    undoStackRef.current.push(data);
    if (undoStackRef.current.length > 20) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);

    setStickersHistory((prev) => [...prev, [...stickers]]);
  };

  const handleUndo = () => {
    const colorCanvas = colorCanvasRef.current;
    if (!colorCanvas || undoStackRef.current.length === 0) return;
    const ctx = colorCanvas.getContext('2d');
    if (!ctx) return;

    const currentData = ctx.getImageData(0, 0, colorCanvas.width, colorCanvas.height);
    redoStackRef.current.push(currentData);

    const prevState = undoStackRef.current.pop();
    if (prevState) {
      ctx.putImageData(prevState, 0, 0);
    }

    if (stickersHistory.length > 0) {
      const prevStickers = stickersHistory[stickersHistory.length - 1];
      setStickersHistory((prev) => prev.slice(0, -1));
      setStickers(prevStickers);
    }

    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
    playPop();
    renderDisplay();
  };

  const handleRedo = () => {
    const colorCanvas = colorCanvasRef.current;
    if (!colorCanvas || redoStackRef.current.length === 0) return;
    const ctx = colorCanvas.getContext('2d');
    if (!ctx) return;

    const currentData = ctx.getImageData(0, 0, colorCanvas.width, colorCanvas.height);
    undoStackRef.current.push(currentData);

    const nextState = redoStackRef.current.pop();
    if (nextState) {
      ctx.putImageData(nextState, 0, 0);
    }

    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
    playPop();
    renderDisplay();
  };

  const handleClear = () => {
    const colorCanvas = colorCanvasRef.current;
    if (!colorCanvas) return;
    const ctx = colorCanvas.getContext('2d');
    if (!ctx) return;

    pushState();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, colorCanvas.width, colorCanvas.height);
    setStickers([]);
    renderDisplay();
    playSplat();
    showToast('Clean page! Ready to color again 🎨');
  };

  const handleMagicColor = () => {
    const colorCanvas = colorCanvasRef.current;
    const outlineCanvas = outlineCanvasRef.current;
    if (!colorCanvas || !outlineCanvas) return;
    const colorCtx = colorCanvas.getContext('2d');
    const outlineCtx = outlineCanvas.getContext('2d');
    if (!colorCtx || !outlineCtx) return;

    pushState();

    const width = colorCanvas.width;
    const height = colorCanvas.height;

    colorCtx.fillStyle = '#FFFFFF';
    colorCtx.fillRect(0, 0, width, height);

    const outlineData = outlineCtx.getImageData(0, 0, width, height);
    const colorData = colorCtx.getImageData(0, 0, width, height);

    const presets = getMagicColorPresets(selectedAnimalId);
    for (const preset of presets) {
      const startX = preset.relX * width;
      const startY = preset.relY * height;
      const rgba = hexToRgba(preset.hex);
      floodFill(colorData, outlineData, startX, startY, rgba, 125);
    }

    colorCtx.putImageData(colorData, 0, 0);

    setStickers([
      { id: 1, sticker: '✨', x: width * 0.18, y: height * 0.28, size: 48 },
      { id: 2, sticker: '💖', x: width * 0.5, y: height * 0.72, size: 42 },
      { id: 3, sticker: '⭐', x: width * 0.88, y: height * 0.88, size: 44 },
    ]);

    renderDisplay();
    playSparkle();
    showToast(`${currentAnimal.name} colored! ✨`);
  };

  const handleSelectAnimal = (nextAnimal: AnimalColoringItem) => {
    if (nextAnimal.id === selectedAnimalId) return;

    // Save current coloring state
    const colorCanvas = colorCanvasRef.current;
    if (colorCanvas) {
      const colorCtx = colorCanvas.getContext('2d');
      if (colorCtx) {
        pagesStateRef.current[selectedAnimalId] = {
          colorImageData: colorCtx.getImageData(0, 0, colorCanvas.width, colorCanvas.height),
          stickers: [...stickers],
        };
      }
    }

    playPop();
    setSelectedAnimalId(nextAnimal.id);
    setShowCatalogModal(false);
  };

  const handlePrevAnimal = () => {
    const prevIdx = (currentAnimalIndex - 1 + ANIMALS_COLLECTION.length) % ANIMALS_COLLECTION.length;
    handleSelectAnimal(ANIMALS_COLLECTION[prevIdx]);
  };

  const handleNextAnimal = () => {
    const nextIdx = (currentAnimalIndex + 1) % ANIMALS_COLLECTION.length;
    handleSelectAnimal(ANIMALS_COLLECTION[nextIdx]);
  };

  // Load new outline image
  useEffect(() => {
    setIsLoading(true);
    setOutlineLoaded(false);
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);

    const outlineUrl = getAnimalOutlineUrl(currentAnimal);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = outlineUrl;

    img.onload = () => {
      const width = img.naturalWidth || 800;
      const height = img.naturalHeight || 1067;

      // Setup Outline Canvas
      const outlineCanvas = document.createElement('canvas');
      outlineCanvas.width = width;
      outlineCanvas.height = height;
      const outlineCtx = outlineCanvas.getContext('2d');
      if (outlineCtx) {
        outlineCtx.drawImage(img, 0, 0, width, height);
      }
      outlineCanvasRef.current = outlineCanvas;

      // Setup Color Canvas
      const colorCanvas = document.createElement('canvas');
      colorCanvas.width = width;
      colorCanvas.height = height;
      const colorCtx = colorCanvas.getContext('2d');
      if (colorCtx) {
        const saved = pagesStateRef.current[currentAnimal.id];
        if (saved && saved.colorImageData && saved.colorImageData.width === width) {
          colorCtx.putImageData(saved.colorImageData, 0, 0);
          setStickers(saved.stickers);
        } else {
          colorCtx.fillStyle = '#FFFFFF';
          colorCtx.fillRect(0, 0, width, height);
          setStickers([]);
        }
      }
      colorCanvasRef.current = colorCanvas;

      // Setup Display Canvas
      const displayCanvas = displayCanvasRef.current;
      if (displayCanvas) {
        displayCanvas.width = width;
        displayCanvas.height = height;
      }

      setIsLoading(false);
      setOutlineLoaded(true);
    };

    img.onerror = () => {
      setIsLoading(false);
      showToast('Could not load outline page.');
    };
  }, [currentAnimal]);

  useEffect(() => {
    if (outlineLoaded) {
      renderDisplay();
    }
  }, [outlineLoaded, renderDisplay]);

  // Canvas coordinates
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const displayCanvas = displayCanvasRef.current;
    if (!displayCanvas) return null;

    const rect = displayCanvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = displayCanvas.width / rect.width;
    const scaleY = displayCanvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    if (selectedTool === 'sticker') {
      pushState();
      const newSticker: StickerItem = {
        id: Date.now(),
        sticker: selectedSticker,
        x: coords.x,
        y: coords.y,
        size: brushSize * 2,
      };
      setStickers((prev) => [...prev, newSticker]);
      playStamp();
      return;
    }

    if (selectedTool === 'bucket') {
      const colorCanvas = colorCanvasRef.current;
      const outlineCanvas = outlineCanvasRef.current;
      if (!colorCanvas || !outlineCanvas) return;
      const colorCtx = colorCanvas.getContext('2d');
      const outlineCtx = outlineCanvas.getContext('2d');
      if (!colorCtx || !outlineCtx) return;

      const width = colorCanvas.width;
      const height = colorCanvas.height;

      const outlineData = outlineCtx.getImageData(0, 0, width, height);
      const colorData = colorCtx.getImageData(0, 0, width, height);

      const fillColor: RGBA = hexToRgba(selectedColor);
      const filled = floodFill(colorData, outlineData, coords.x, coords.y, fillColor, 125);

      if (filled) {
        pushState();
        colorCtx.putImageData(colorData, 0, 0);
        renderDisplay();
        playPop();
      }
      return;
    }

    isDrawingRef.current = true;
    lastPosRef.current = coords;
    pushState();
    drawStroke(coords.x, coords.y, coords.x, coords.y);
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !lastPosRef.current) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;

    drawStroke(lastPosRef.current.x, lastPosRef.current.y, coords.x, coords.y);
    lastPosRef.current = coords;
  };

  const handlePointerUp = () => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      lastPosRef.current = null;
      renderDisplay();
    }
  };

  const drawStroke = (x1: number, y1: number, x2: number, y2: number) => {
    const colorCanvas = colorCanvasRef.current;
    if (!colorCanvas) return;
    const ctx = colorCanvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (selectedTool === 'eraser') {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = brushSize * 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if (selectedTool === 'crayon') {
      ctx.strokeStyle = selectedColor;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = brushSize;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const dist = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(1, Math.floor(dist / 4));
      ctx.fillStyle = selectedColor;
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const cx = x1 + (x2 - x1) * t + (Math.random() - 0.5) * brushSize * 0.7;
        const cy = y1 + (y2 - y1) * t + (Math.random() - 0.5) * brushSize * 0.7;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.random() * 2 + 1, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (selectedTool === 'brush') {
      ctx.strokeStyle = selectedColor;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = brushSize;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.restore();
    renderDisplay();
  };

  const handleDownloadImage = (mode: 'clean' | 'colored') => {
    if (mode === 'clean') {
      const url = getAnimalOutlineUrl(currentAnimal);
      const link = document.createElement('a');
      link.download = `page-${currentAnimal.number}-${currentAnimal.id}.jpg`;
      link.href = url;
      link.click();
      playCheer();
      showToast('Clean coloring sheet downloaded! 🖨️');
    } else {
      const displayCanvas = displayCanvasRef.current;
      if (!displayCanvas) return;
      const dataUrl = displayCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `my-${currentAnimal.id}-artwork.png`;
      link.href = dataUrl;
      link.click();
      playCheer();
      showToast('Masterpiece saved! ⭐');
    }
  };

  const handlePrint = (scope: 'current_clean' | 'current_colored' | 'category_booklet' | 'all_100') => {
    setPrintScope(scope);
    setShowPrintModal(false);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  const printAnimalsList = useMemo(() => {
    if (printScope === 'category_booklet') {
      return ANIMALS_COLLECTION.filter((a) => a.category === currentAnimal.category);
    }
    if (printScope === 'all_100') {
      return ANIMALS_COLLECTION;
    }
    return [currentAnimal];
  }, [printScope, currentAnimal]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-yellow-100 text-stone-800 flex flex-col font-sans select-none">
      {/* Print Viewport (Only rendered when printing) */}
      <div id="print-area" className="hidden print-only">
        {printScope === 'current_colored' ? (
          displayCanvasRef.current && (
            <div className="w-full h-screen flex flex-col items-center justify-between p-6">
              <div className="w-full text-center pb-2 border-b-2 border-dashed border-stone-300">
                <div className="flex justify-between items-center text-sm font-bold text-stone-600 px-6">
                  <span>Artist: ______________________</span>
                  <span className="text-base font-extrabold text-amber-700">
                    {currentAnimal.emoji} {currentAnimal.name} Masterpiece
                  </span>
                  <span>Date: ____________</span>
                </div>
              </div>
              <img
                src={displayCanvasRef.current.toDataURL('image/png')}
                alt="My Colored Artwork"
                referrerPolicy="no-referrer"
                className="max-h-[84vh] max-w-[86vw] object-contain mx-auto rounded-lg shadow"
              />
              <div className="w-full text-center text-xs text-stone-400">
                African Safari Coloring Book • Page {currentAnimal.number} of 100
              </div>
            </div>
          )
        ) : (
          <div className="w-full">
            {printAnimalsList.map((animal) => (
              <div
                key={animal.id}
                className="w-full h-screen flex flex-col items-center justify-between p-6 box-border"
                style={{ pageBreakAfter: animal.number === printAnimalsList.length ? 'auto' : 'always' }}
              >
                <div className="w-full text-center pb-2 border-b-2 border-dashed border-stone-400">
                  <div className="flex justify-between items-center text-sm font-bold text-stone-600 px-6">
                    <span>Artist: _____________________</span>
                    <span className="text-base font-extrabold text-stone-900">
                      {animal.emoji} {animal.number}. {animal.name}
                    </span>
                    <span>Date: ____________</span>
                  </div>
                </div>
                <img
                  src={getAnimalOutlineUrl(animal)}
                  alt={animal.name}
                  referrerPolicy="no-referrer"
                  className="max-h-[82vh] max-w-[85vw] object-contain mx-auto"
                />
                <div className="w-full text-center text-xs text-stone-400 pt-2 border-t border-stone-200">
                  African Safari Coloring Book • {animal.subtitle} • {animal.fact}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Interactive Screen */}
      <div className="no-print flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Navbar */}
        <header className="bg-white/95 backdrop-blur-md border-b-2 border-amber-200 shadow-sm px-3 sm:px-4 py-2 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowCatalogModal(true)}
              title="Browse all 100 animal pages"
              className="w-10 h-10 sm:w-11 sm:h-11 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-md transform hover:rotate-6 hover:scale-105 transition-all cursor-pointer"
            >
              <span className="text-xl sm:text-2xl">{currentAnimal.emoji.split(' ')[0]}</span>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-base sm:text-xl text-stone-900 tracking-tight flex items-center gap-1.5">
                  Safari Animals Coloring Book
                </h1>
                <button
                  onClick={() => setShowCatalogModal(true)}
                  className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Grid className="w-3 h-3 text-amber-700" />
                  <span>100 Animal Pages</span>
                </button>
              </div>
              <p className="text-xs text-stone-500 hidden sm:block">
                Page {currentAnimal.number} of 100: {currentAnimal.subtitle}
              </p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={handleMagicColor}
              title="Magic Color Surprise"
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-yellow-100 animate-spin" />
              <span className="hidden xs:inline">Magic Color!</span>
            </button>

            <button
              onClick={() => setShowPrintModal(true)}
              title="Print coloring sheets"
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print</span>
            </button>

            <button
              onClick={() => handleDownloadImage('colored')}
              title="Save colored picture"
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Save</span>
            </button>

            <button
              onClick={handleToggleSound}
              title={soundOn ? 'Turn sound off' : 'Turn sound on'}
              className="p-1.5 sm:p-2 rounded-xl bg-stone-100 hover:bg-amber-100 text-stone-700 hover:text-amber-800 transition-colors cursor-pointer"
            >
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-stone-400" />}
            </button>

            <button
              onClick={() => setShowInfoModal(true)}
              title="About this animal collection"
              className="p-1.5 sm:p-2 rounded-xl bg-stone-100 hover:bg-amber-100 text-stone-700 hover:text-amber-800 transition-colors cursor-pointer"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Animal Carousel Bar with 20 Quick Access Pills + 80 More Catalogue Button */}
        <div className="bg-amber-100/90 border-b border-amber-200 px-2 sm:px-4 py-1.5 shrink-0 flex items-center gap-2 overflow-x-auto no-scrollbar z-10 shadow-xs">
          <div className="flex items-center gap-1 shrink-0 pr-2 border-r border-amber-300">
            <button
              onClick={handlePrevAnimal}
              title="Previous animal page"
              className="p-1 rounded-lg bg-white/80 hover:bg-white text-stone-700 shadow-xs cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowCatalogModal(true)}
              title="Click to view all 100 pages catalogue"
              className="text-xs font-extrabold text-amber-900 px-1.5 py-0.5 rounded-md hover:bg-amber-200 cursor-pointer min-w-[3.5rem] text-center"
            >
              #{currentAnimal.number}/100
            </button>
            <button
              onClick={handleNextAnimal}
              title="Next animal page"
              className="p-1 rounded-lg bg-white/80 hover:bg-white text-stone-700 shadow-xs cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Page Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {carouselAnimals.map((animal) => {
              const isSelected = animal.id === selectedAnimalId;
              return (
                <button
                  key={animal.id}
                  onClick={() => handleSelectAnimal(animal)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-600 text-white shadow-md scale-105 ring-2 ring-amber-300'
                      : 'bg-white/80 hover:bg-white text-stone-700 border border-amber-200 hover:scale-102'
                  }`}
                >
                  <span className="text-sm">{animal.emoji}</span>
                  <span className="whitespace-nowrap">{animal.number}. {animal.name}</span>
                </button>
              );
            })}

            {/* +80 More Catalogue Trigger Button */}
            <button
              onClick={() => setShowCatalogModal(true)}
              title="Browse complete catalogue of all 100 coloring pages"
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-extrabold bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm hover:shadow-md transition-all cursor-pointer shrink-0 hover:scale-105 active:scale-95 border border-amber-400 group"
            >
              <Grid className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
              <span>+{remainingCarouselCount > 0 ? remainingCarouselCount : 80} More</span>
              <span className="text-[10px] bg-white/25 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Catalogue
              </span>
            </button>
          </div>
        </div>

        {/* Workspace Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          {/* Left Controls Panel */}
          <aside className="w-full md:w-64 lg:w-72 bg-white/95 border-b md:border-b-0 md:border-r border-amber-200 flex flex-col p-3 sm:p-4 gap-3 overflow-y-auto shrink-0 z-10 shadow-sm">
            {/* Tool Selection */}
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-900 block mb-2">
                1. Pick a Tool
              </span>
              <div className="grid grid-cols-5 md:grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setSelectedTool('bucket');
                    playPop();
                  }}
                  className={`flex flex-col md:flex-row items-center gap-1.5 p-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                    selectedTool === 'bucket'
                      ? 'bg-amber-500 text-white shadow-md scale-102 ring-2 ring-amber-300'
                      : 'bg-amber-50 hover:bg-amber-100 text-stone-700 border border-amber-200'
                  }`}
                >
                  <PaintBucket className="w-4 h-4" />
                  <span>Bucket Fill</span>
                </button>

                <button
                  onClick={() => {
                    setSelectedTool('crayon');
                    playPop();
                  }}
                  className={`flex flex-col md:flex-row items-center gap-1.5 p-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                    selectedTool === 'crayon'
                      ? 'bg-orange-500 text-white shadow-md scale-102 ring-2 ring-orange-300'
                      : 'bg-orange-50 hover:bg-orange-100 text-stone-700 border border-orange-200'
                  }`}
                >
                  <span className="text-sm">🖍️</span>
                  <span>Crayon</span>
                </button>

                <button
                  onClick={() => {
                    setSelectedTool('brush');
                    playPop();
                  }}
                  className={`flex flex-col md:flex-row items-center gap-1.5 p-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                    selectedTool === 'brush'
                      ? 'bg-purple-500 text-white shadow-md scale-102 ring-2 ring-purple-300'
                      : 'bg-purple-50 hover:bg-purple-100 text-stone-700 border border-purple-200'
                  }`}
                >
                  <Brush className="w-4 h-4" />
                  <span>Brush</span>
                </button>

                <button
                  onClick={() => {
                    setSelectedTool('sticker');
                    playPop();
                  }}
                  className={`flex flex-col md:flex-row items-center gap-1.5 p-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                    selectedTool === 'sticker'
                      ? 'bg-pink-500 text-white shadow-md scale-102 ring-2 ring-pink-300'
                      : 'bg-pink-50 hover:bg-pink-100 text-stone-700 border border-pink-200'
                  }`}
                >
                  <span className="text-sm">⭐</span>
                  <span>Stickers</span>
                </button>

                <button
                  onClick={() => {
                    setSelectedTool('eraser');
                    playPop();
                  }}
                  className={`flex flex-col md:flex-row items-center gap-1.5 p-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                    selectedTool === 'eraser'
                      ? 'bg-stone-700 text-white shadow-md scale-102 ring-2 ring-stone-400'
                      : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200'
                  }`}
                >
                  <Eraser className="w-4 h-4" />
                  <span>Eraser</span>
                </button>
              </div>
            </div>

            {/* Sticker picker if sticker tool selected */}
            {selectedTool === 'sticker' && (
              <div className="bg-pink-50 p-2.5 rounded-2xl border border-pink-200 animate-pop">
                <span className="text-xs font-bold text-pink-900 block mb-1.5">
                  Choose Sticker:
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {FUN_STICKERS.map((st) => (
                    <button
                      key={st.id}
                      onClick={() => {
                        setSelectedSticker(st.icon);
                        playPop();
                      }}
                      className={`text-xl p-1.5 rounded-xl transition-all cursor-pointer ${
                        selectedSticker === st.icon
                          ? 'bg-white shadow-md ring-2 ring-pink-400 scale-110'
                          : 'hover:bg-white/70'
                      }`}
                    >
                      {st.icon}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Brush / Sticker Size */}
            {selectedTool !== 'bucket' && (
              <div className="bg-stone-50 p-2.5 rounded-2xl border border-stone-200">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-bold text-stone-700">Size:</span>
                  <span className="text-xs font-bold text-amber-700">{brushSize}px</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs">Small</span>
                  <input
                    type="range"
                    min="8"
                    max="64"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="flex-1 accent-amber-500 cursor-pointer"
                  />
                  <span className="text-xs">Big</span>
                </div>
              </div>
            )}

            {/* Line Protection Toggle */}
            <div className="bg-amber-50/70 p-2.5 rounded-2xl border border-amber-200/80">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepLinesOnTop}
                  onChange={(e) => {
                    setKeepLinesOnTop(e.target.checked);
                    playPop();
                  }}
                  className="rounded text-amber-600 focus:ring-amber-400 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs font-bold text-stone-700">
                  Keep Black Lines Crisp on Top
                </span>
              </label>
              <p className="text-[10px] text-stone-500 mt-1 pl-6">
                Prevents coloring over outlines!
              </p>
            </div>

            {/* Current Subject Badge with Fact */}
            <div className="bg-orange-50/90 p-3 rounded-2xl border border-orange-200 text-xs shadow-xs">
              <div className="flex items-center justify-between">
                <div className="font-extrabold text-orange-950 flex items-center gap-1.5 text-sm">
                  <span>{currentAnimal.emoji}</span>
                  <span>{currentAnimal.number}. {currentAnimal.name}</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-200 text-orange-900">
                  {currentAnimal.category}
                </span>
              </div>
              <p className="text-[11px] text-orange-800 mt-1 font-medium">{currentAnimal.subtitle}</p>
              <div className="mt-2 pt-2 border-t border-orange-200/60 text-[10px] text-orange-900 italic">
                💡 {currentAnimal.fact}
              </div>
            </div>

            {/* Action Bar (Undo, Redo, Clear) */}
            <div className="mt-auto pt-2 border-t border-amber-100 flex items-center justify-between gap-1.5">
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                title="Undo"
                className="flex-1 py-1.5 px-2 bg-stone-100 hover:bg-stone-200 disabled:opacity-40 disabled:hover:bg-stone-100 text-stone-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Undo</span>
              </button>

              <button
                onClick={handleRedo}
                disabled={!canRedo}
                title="Redo"
                className="flex-1 py-1.5 px-2 bg-stone-100 hover:bg-stone-200 disabled:opacity-40 disabled:hover:bg-stone-100 text-stone-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Redo</span>
              </button>

              <button
                onClick={handleClear}
                title="Clear and start over"
                className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-bold text-xs flex items-center justify-center transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </aside>

          {/* Central Canvas Viewport */}
          <main className="flex-1 bg-stone-100/70 p-2 sm:p-4 flex flex-col items-center justify-center overflow-auto relative">
            {toastMessage && (
              <div className="absolute top-4 z-30 bg-stone-900/90 text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-bounce">
                <span>{toastMessage}</span>
              </div>
            )}

            {/* Canvas Zoom Controls */}
            <div className="absolute top-4 right-4 z-10 flex items-center gap-1 bg-white/90 backdrop-blur-sm p-1.5 rounded-2xl shadow-md border border-stone-200">
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.15))}
                title="Zoom Out"
                className="p-1.5 hover:bg-stone-100 rounded-xl text-stone-600 transition-colors cursor-pointer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-stone-600 px-1 min-w-[3rem] text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(1.8, z + 0.15))}
                title="Zoom In"
                className="p-1.5 hover:bg-stone-100 rounded-xl text-stone-600 transition-colors cursor-pointer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              {zoomLevel !== 1 && (
                <button
                  onClick={() => setZoomLevel(1)}
                  className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Canvas Frame */}
            <div
              ref={containerRef}
              className="relative shadow-2xl rounded-2xl overflow-hidden bg-white border-4 border-amber-300 max-h-[70vh] flex items-center justify-center transition-transform duration-150"
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'center center',
              }}
            >
              {isLoading && (
                <div className="w-[340px] h-[450px] sm:w-[480px] sm:h-[640px] flex flex-col items-center justify-center gap-3 bg-amber-50">
                  <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <span className="font-bold text-amber-800 text-sm">
                    Opening Page {currentAnimal.number}: {currentAnimal.name}...
                  </span>
                </div>
              )}

              <canvas
                ref={displayCanvasRef}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
                className={`block max-h-[68vh] w-auto object-contain touch-none ${
                  selectedTool === 'bucket'
                    ? 'cursor-crosshair'
                    : selectedTool === 'eraser'
                    ? 'cursor-cell'
                    : 'cursor-crosshair'
                }`}
              />
            </div>

            {/* Bottom Caption & Navigation */}
            <div className="mt-2 flex items-center gap-3 text-xs text-stone-600">
              <button
                onClick={handlePrevAnimal}
                className="flex items-center gap-1 font-bold text-amber-700 hover:text-amber-900 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev Page</span>
              </button>
              <span className="text-stone-300">•</span>
              <button
                onClick={() => setShowCatalogModal(true)}
                className="text-stone-700 font-bold hover:text-amber-700 cursor-pointer underline decoration-dotted"
              >
                Browse All 100 Pages
              </button>
              <span className="text-stone-300">•</span>
              <button
                onClick={handleNextAnimal}
                className="flex items-center gap-1 font-bold text-amber-700 hover:text-amber-900 cursor-pointer"
              >
                <span>Next Page</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </main>
        </div>

        {/* Bottom Color Palette Bar */}
        <footer className="bg-white/95 border-t-2 border-amber-200 p-2 sm:p-3 shrink-0 z-20 shadow-md">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            {/* Active Color Badge */}
            <div className="flex items-center gap-2 pr-3 border-r border-amber-200 shrink-0">
              <div
                className="w-10 h-10 rounded-2xl shadow-inner border-2 border-stone-300 flex items-center justify-center transition-transform transform scale-105"
                style={{ backgroundColor: selectedColor }}
              >
                <Check
                  className="w-5 h-5 drop-shadow"
                  style={{
                    color:
                      selectedColor === '#FFFFFF' || selectedColor === '#FEF08A' || selectedColor === '#FDE047'
                        ? '#000000'
                        : '#FFFFFF',
                  }}
                />
              </div>
              <div className="hidden sm:block">
                <span className="text-[10px] uppercase font-extrabold text-stone-400 block">
                  Active
                </span>
                <span className="text-xs font-bold text-stone-800 truncate max-w-[70px] block">
                  {SAVANNA_PALETTE.find((s) => s.hex.toLowerCase() === selectedColor.toLowerCase())?.name ||
                    selectedColor}
                </span>
              </div>
            </div>

            {/* Palette Swatches */}
            <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {SAVANNA_PALETTE.map((color) => {
                const isSelected = selectedColor.toLowerCase() === color.hex.toLowerCase();
                return (
                  <button
                    key={color.hex}
                    onClick={() => {
                      setSelectedColor(color.hex);
                      if (selectedTool === 'eraser') setSelectedTool('bucket');
                      playPop();
                    }}
                    title={color.name}
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl shrink-0 transition-all cursor-pointer relative shadow-sm flex items-center justify-center ${
                      isSelected
                        ? 'scale-115 ring-4 ring-amber-400 z-10 shadow-lg -translate-y-1'
                        : 'hover:scale-105 hover:-translate-y-0.5'
                    }`}
                    style={{
                      backgroundColor: color.hex,
                      border: color.hex === '#FFFFFF' ? '2px solid #E2E8F0' : 'none',
                    }}
                  >
                    {isSelected && (
                      <Check
                        className="w-4 h-4 drop-shadow"
                        style={{ color: color.textColor || '#FFFFFF' }}
                      />
                    )}
                  </button>
                );
              })}

              {/* Custom Color Input */}
              <label
                title="Pick Custom Color"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl shrink-0 bg-gradient-to-tr from-rose-400 via-amber-400 to-sky-400 flex items-center justify-center cursor-pointer shadow-sm hover:scale-105 transition-transform relative"
              >
                <Palette className="w-5 h-5 text-white drop-shadow" />
                <input
                  type="color"
                  value={selectedColor}
                  onChange={(e) => {
                    setSelectedColor(e.target.value);
                    if (selectedTool === 'eraser') setSelectedTool('bucket');
                  }}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                />
              </label>
            </div>
          </div>
        </footer>
      </div>

      {/* 100 Animals Library Modal */}
      {showCatalogModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border-4 border-amber-300 animate-pop overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-amber-200 flex items-center justify-between bg-amber-50/70">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🦁</span>
                <div>
                  <h3 className="font-extrabold text-lg sm:text-xl text-stone-900">
                    100 African Safari Coloring Pages
                  </h3>
                  <p className="text-xs text-stone-500">
                    100% Matching Style • Thick Outlines • Zero Shading • Ages 4–8
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCatalogModal(false)}
                className="p-2 rounded-xl hover:bg-stone-200 text-stone-500 hover:text-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search & Category Tabs */}
            <div className="p-3 sm:p-4 border-b border-stone-200 bg-white space-y-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  placeholder="Search any page (e.g. Gorilla, Crocodile, Camel, Meerkat Picnic, Finale, 99...)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-stone-100 rounded-xl text-sm font-medium border border-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {CATEGORIES.map((cat) => {
                  const isActive = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                      }`}
                    >
                      <span>{cat.emoji}</span>
                      <span>{cat.name}</span>
                      <span className="text-[10px] opacity-80 font-extrabold">({cat.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Animals Grid View */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-stone-50/50">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredAnimals.map((animal) => {
                  const isSelected = animal.id === selectedAnimalId;
                  return (
                    <button
                      key={animal.id}
                      onClick={() => handleSelectAnimal(animal)}
                      className={`p-3 rounded-2xl text-left transition-all cursor-pointer flex flex-col justify-between border-2 bg-white relative group overflow-hidden ${
                        isSelected
                          ? 'border-amber-500 ring-2 ring-amber-300 shadow-md scale-102 bg-amber-50/50'
                          : 'border-stone-200 hover:border-amber-400 hover:shadow-md hover:scale-102'
                      }`}
                    >
                      {/* Image Thumbnail Preview */}
                      <div className="w-full aspect-[3/4] bg-stone-100 rounded-xl overflow-hidden mb-2 border border-stone-200 relative">
                        <img
                          src={animal.imageUrl}
                          alt={animal.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <span className="absolute top-1 left-1 bg-stone-900/80 text-white font-extrabold text-[10px] px-1.5 py-0.5 rounded">
                          #{animal.number}
                        </span>
                      </div>

                      <div>
                        <h4 className="font-extrabold text-sm text-stone-900 group-hover:text-amber-800 line-clamp-1">
                          {animal.name}
                        </h4>
                        <p className="text-[11px] text-stone-500 line-clamp-1 mt-0.5">
                          {animal.subtitle}
                        </p>
                      </div>

                      <div className="mt-2 pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-400">
                        <span className="truncate max-w-[80px]">{animal.categoryLabel}</span>
                        {isSelected ? (
                          <span className="font-bold text-amber-600 flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Selected
                          </span>
                        ) : (
                          <span className="text-amber-700 font-bold group-hover:underline">Color</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-white border-t border-stone-200 flex items-center justify-between text-xs text-stone-500">
              <span>Showing {filteredAnimals.length} of 100 pages</span>
              <button
                onClick={() => setShowCatalogModal(false)}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl cursor-pointer"
              >
                Close Library
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Sheet Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-4 border-amber-300 animate-pop">
            <div className="text-center mb-5">
              <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mx-auto mb-3 text-3xl">
                🖨️
              </div>
              <h3 className="font-extrabold text-xl text-stone-900">Print Coloring Pages</h3>
              <p className="text-sm text-stone-500 mt-1">
                Print crisp black outlines for crayons, pencils, or markers!
              </p>
            </div>

            <div className="space-y-2.5 mb-6">
              {/* Option 1: Print Current Clean Sheet */}
              <button
                onClick={() => handlePrint('current_clean')}
                className="w-full p-3 rounded-2xl border-2 border-amber-300 hover:border-amber-500 bg-amber-50/50 hover:bg-amber-100 flex items-center gap-3 transition-all text-left cursor-pointer group"
              >
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-stone-200 flex items-center justify-center text-xl shrink-0">
                  📄
                </div>
                <div>
                  <h4 className="font-bold text-stone-900 text-sm">
                    Print Page #{currentAnimal.number}: {currentAnimal.name}
                  </h4>
                  <p className="text-xs text-stone-500">
                    Clean, thick black outlines on pure white paper.
                  </p>
                </div>
              </button>

              {/* Option 2: Print Category Set */}
              <button
                onClick={() => handlePrint('category_booklet')}
                className="w-full p-3 rounded-2xl border-2 border-orange-300 hover:border-orange-500 bg-orange-50/50 hover:bg-orange-100 flex items-center gap-3 transition-all text-left cursor-pointer group"
              >
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-stone-200 flex items-center justify-center text-xl shrink-0">
                  <BookOpen className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h4 className="font-bold text-stone-900 text-sm flex items-center gap-1.5">
                    <span>Print {currentAnimal.categoryLabel} Set</span>
                    <span className="px-1.5 py-0.2 text-[10px] bg-orange-200 text-orange-800 rounded font-extrabold">Booklet</span>
                  </h4>
                  <p className="text-xs text-stone-500">
                    All pages in this group ready to staple into a coloring booklet!
                  </p>
                </div>
              </button>

              {/* Option 3: Print Entire 100-Page Safari Coloring Book */}
              <button
                onClick={() => handlePrint('all_100')}
                className="w-full p-3 rounded-2xl border-2 border-purple-300 hover:border-purple-500 bg-purple-50/50 hover:bg-purple-100 flex items-center gap-3 transition-all text-left cursor-pointer group"
              >
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-stone-200 flex items-center justify-center text-xl shrink-0">
                  📚
                </div>
                <div>
                  <h4 className="font-bold text-stone-900 text-sm flex items-center gap-1.5">
                    <span>Print Complete 100-Page Book</span>
                    <span className="px-1.5 py-0.2 text-[10px] bg-purple-200 text-purple-800 rounded font-extrabold">100 Pages</span>
                  </h4>
                  <p className="text-xs text-stone-500">
                    The complete safari coloring book with all 100 animal sheets!
                  </p>
                </div>
              </button>

              {/* Option 4: Print Colored Artwork */}
              <button
                onClick={() => handlePrint('current_colored')}
                className="w-full p-3 rounded-2xl border-2 border-emerald-300 hover:border-emerald-500 bg-emerald-50/50 hover:bg-emerald-100 flex items-center gap-3 transition-all text-left cursor-pointer group"
              >
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-stone-200 flex items-center justify-center text-xl shrink-0">
                  🎨
                </div>
                <div>
                  <h4 className="font-bold text-stone-900 text-sm">
                    Print My Colored Artwork
                  </h4>
                  <p className="text-xs text-stone-500">
                    Print your completed colored animal to hang on the fridge!
                  </p>
                </div>
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowPrintModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 font-bold hover:bg-stone-100 transition-colors cursor-pointer text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDownloadImage('clean')}
                className="py-2.5 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold transition-colors cursor-pointer text-sm flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Save Clean JPG</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border-4 border-amber-300 animate-pop">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🦁🐘🦒</span>
                <div>
                  <h3 className="font-extrabold text-lg text-stone-900">
                    African Safari Coloring Collection
                  </h3>
                  <p className="text-xs text-stone-500">
                    100 genuine coloring sheets in 100% uniform cartoon style
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="p-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 text-xl font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm text-stone-600 mb-6 leading-relaxed max-h-[60vh] overflow-y-auto pr-1">
              <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200">
                <h4 className="font-bold text-amber-900 mb-1">🐾 100 Coloring Adventures:</h4>
                <p className="text-xs text-amber-950 mb-2">
                  Featuring 100 full pages covering every creature and landscape of the African safari:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-amber-950 font-medium">
                  <div className="p-2 bg-white rounded-xl border border-amber-200">
                    <span className="font-bold text-amber-800">🐘 Savanna Giants (1-6, 11-16, 29-30, 74-75, 81, 85, 89-90, 93, 95, 98)</span>
                    <p className="text-[11px] text-stone-500 mt-0.5">Elephants, giraffes, zebras, rhinos, hippos, buffalos, wildebeests, impalas, gazelles, camels.</p>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-amber-200">
                    <span className="font-bold text-amber-800">🦁 Big Cats & Hunters (1, 8, 12, 17, 25-28, 76, 96)</span>
                    <p className="text-[11px] text-stone-500 mt-0.5">Lions, cheetahs, leopards, hyenas, wild dogs, caracals, servals, jackals.</p>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-amber-200">
                    <span className="font-bold text-amber-800">🐒 Monkeys & Primates (31-40, 80, 87, 88, 91)</span>
                    <p className="text-[11px] text-stone-500 mt-0.5">Gorillas, chimpanzees, baboons, mandrills, colobus monkeys, vervet monkeys, bushbabies, lemurs.</p>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-amber-200">
                    <span className="font-bold text-amber-800">🦩 Birds of Africa (9, 13, 41-55, 67, 82, 86)</span>
                    <p className="text-[11px] text-stone-500 mt-0.5">Fish eagles, flamingos, crowned cranes, hornbills, weavers, parrots, sunbirds, owls, penguins.</p>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-amber-200">
                    <span className="font-bold text-amber-800">🐢 Reptiles & Wonders (56-65, 68)</span>
                    <p className="text-[11px] text-stone-500 mt-0.5">Nile crocodiles, giant tortoises, chameleons, monitor lizards, tree frogs, dung beetles, butterflies, mantis.</p>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-amber-200">
                    <span className="font-bold text-amber-800">🐾 Babies & Families (10, 18-24, 32, 57, 66, 73, 79, 92, 94, 97)</span>
                    <p className="text-[11px] text-stone-500 mt-0.5">Baby lions, elephant calves, baby giraffes, zebra foals, baby rhinos, hippo calves, cheetah cubs.</p>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-amber-200 sm:col-span-2">
                    <span className="font-bold text-amber-800">🚙 Safari Adventures & Grand Finale (7, 69-72, 77-78, 83-84, 99-100)</span>
                    <p className="text-[11px] text-stone-500 mt-0.5">Safari jeep with peeking giraffe, hot air balloon, meerkat picnic, birthday party, and grand safari finale!</p>
                  </div>
                </div>
              </div>

              <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200">
                <h4 className="font-bold text-emerald-900 mb-1">✨ 100% Style Consistency:</h4>
                <ul className="list-disc pl-5 space-y-1 text-xs text-emerald-950">
                  <li>Identical line thickness and bold outlines across all 100 drawings</li>
                  <li>Pure white background with zero grey shading, zero gradients</li>
                  <li>One large friendly cartoon animal centered with 2–3 savanna elements</li>
                  <li>Plenty of open white space inside shapes for easy coloring (ages 4–8)</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowInfoModal(false)}
                className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold transition-colors cursor-pointer text-sm"
              >
                Let's Color!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
