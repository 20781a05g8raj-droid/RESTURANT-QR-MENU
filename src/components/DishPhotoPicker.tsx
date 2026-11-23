import React, { useRef, useState } from 'react';
import { ImagePlus, Link2, Loader2, Star, Upload, X } from 'lucide-react';
import { GENERATED_IMAGES } from '../data/seedData';
import { compressImageFileToDataUrl } from '../utils/imageUpload';
import { isSafeImageUrl, MAX_DISH_IMAGES, normalizeDishImages } from '../utils/restaurantLogic';

export const DISH_PHOTO_PRESETS = [
  { label: 'Curry', url: GENERATED_IMAGES.butterChicken },
  { label: 'Tandoori', url: GENERATED_IMAGES.paneerTikka },
  { label: 'Pasta', url: GENERATED_IMAGES.trufflePasta },
  { label: 'Dessert', url: GENERATED_IMAGES.matchaTiramisu },
];

interface DishPhotoPickerProps {
  images: string[];
  onChange: (nextImages: string[]) => void;
  idPrefix?: string;
}

export function DishPhotoPicker({
  images,
  onChange,
  idPrefix = 'dish-photos',
}: DishPhotoPickerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const remainingSlots = Math.max(0, MAX_DISH_IMAGES - images.length);

  const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    if (remainingSlots <= 0) {
      setPhotoError(`Maximum ${MAX_DISH_IMAGES} photos per dish reached. Remove one to add more.`);
      return;
    }

    setUploading(true);
    setPhotoError(null);

    const filesToProcess = files.slice(0, remainingSlots);
    const added: string[] = [];
    const errors: string[] = [];

    for (const file of filesToProcess) {
      try {
        const compressed = await compressImageFileToDataUrl(file);
        added.push(compressed);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Failed to upload ${file.name}`);
      }
    }

    if (added.length > 0) {
      onChange(normalizeDishImages([...images, ...added]));
    }

    if (errors.length > 0) {
      setPhotoError(errors[0]);
    } else if (files.length > remainingSlots) {
      setPhotoError(`Only the first ${remainingSlots} photo(s) were added (max ${MAX_DISH_IMAGES} per dish).`);
    }

    setUploading(false);
  };

  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (remainingSlots <= 0) {
      setPhotoError(`Maximum ${MAX_DISH_IMAGES} photos per dish reached.`);
      return;
    }
    if (!isSafeImageUrl(trimmed)) {
      setPhotoError('Please enter a valid http:// or https:// image URL.');
      return;
    }
    if (images.includes(trimmed)) {
      setPhotoError('This image is already in the dish gallery.');
      return;
    }
    setPhotoError(null);
    onChange(normalizeDishImages([...images, trimmed]));
    setUrlInput('');
  };

  const handleAddPreset = (url: string) => {
    if (images.includes(url)) {
      setPhotoError('This sample photo is already added.');
      return;
    }
    if (remainingSlots <= 0) {
      setPhotoError(`Maximum ${MAX_DISH_IMAGES} photos per dish reached.`);
      return;
    }
    setPhotoError(null);
    onChange(normalizeDishImages([...images, url]));
  };

  const handleRemove = (index: number) => {
    setPhotoError(null);
    onChange(images.filter((_, idx) => idx !== index));
  };

  const handleMakeCover = (index: number) => {
    if (index <= 0 || index >= images.length) return;
    const chosen = images[index];
    const reordered = [chosen, ...images.filter((_, idx) => idx !== index)];
    onChange(reordered);
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <label
            htmlFor={`${idPrefix}-file-input`}
            className="block text-xs font-semibold text-slate-800"
          >
            Dish Photos ({images.length}/{MAX_DISH_IMAGES})
          </label>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload multiple photos from your device or paste image links. First photo is shown as the main cover.
          </p>
        </div>

        <button
          type="button"
          disabled={uploading || remainingSlots <= 0}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          <span>{uploading ? 'Processing...' : 'Upload Photos'}</span>
        </button>

        <input
          ref={fileInputRef}
          id={`${idPrefix}-file-input`}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          onChange={handleFilesSelected}
          className="sr-only"
          aria-label="Upload multiple dish photos"
        />
      </div>

      {/* Add via Image URL */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id={`${idPrefix}-url-input`}
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddUrl();
              }
            }}
            placeholder="Or paste an image URL (https://...) and click Add URL"
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
        <button
          type="button"
          onClick={handleAddUrl}
          disabled={remainingSlots <= 0 || !urlInput.trim()}
          className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
        >
          <ImagePlus className="w-3.5 h-3.5" />
          <span>Add URL</span>
        </button>
      </div>

      {/* Quick Sample Dish Photos */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-slate-500">Quick sample photos:</span>
        {DISH_PHOTO_PRESETS.map((preset) => {
          const alreadyAdded = images.includes(preset.url);
          return (
            <button
              key={preset.label}
              type="button"
              disabled={alreadyAdded || remainingSlots <= 0}
              onClick={() => handleAddPreset(preset.url)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 bg-white text-[11px] font-medium text-slate-700 hover:border-emerald-500 hover:text-emerald-800 disabled:opacity-45 transition-colors"
            >
              <img
                src={preset.url}
                alt={preset.label}
                className="w-4 h-4 rounded object-cover"
              />
              <span>+ {preset.label}</span>
            </button>
          );
        })}
      </div>

      {photoError && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {photoError}
        </p>
      )}

      {/* Selected Gallery Preview Grid */}
      {images.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 pt-1">
          {images.map((src, index) => (
            <div
              key={`${index}-${src.slice(0, 48)}`}
              className="relative group rounded-lg overflow-hidden border border-slate-200 bg-white aspect-square"
            >
              <img
                src={src}
                alt={`Dish photo ${index + 1}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />

              {index === 0 ? (
                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-semibold">
                  Cover
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleMakeCover(index)}
                  aria-label={`Set photo ${index + 1} as cover`}
                  className="absolute bottom-1.5 left-1.5 right-1.5 py-1 rounded bg-slate-900/80 text-white text-[10px] font-medium hover:bg-emerald-700 transition-colors inline-flex items-center justify-center gap-1"
                >
                  <Star className="w-2.5 h-2.5" />
                  <span>Set Cover</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleRemove(index)}
                aria-label={`Remove dish photo ${index + 1}`}
                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-slate-900/80 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white py-5 px-4 text-center">
          <p className="text-xs text-slate-500">
            No custom photos selected yet. Upload from your device, paste URLs, or pick sample photos above.
          </p>
        </div>
      )}
    </div>
  );
}
