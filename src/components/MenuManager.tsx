import React, { useMemo, useState } from 'react';
import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { GENERATED_IMAGES } from '../data/seedData';
import {
  canRoleEditMenuPrices,
  canRoleToggleAvailability,
  formatCurrency,
  validateMenuItemInput,
} from '../utils/restaurantLogic';

const IMAGE_PRESETS = [
  { label: 'Butter Chicken / Curry', url: GENERATED_IMAGES.butterChicken },
  { label: 'Tandoori Paneer / Starter', url: GENERATED_IMAGES.paneerTikka },
  { label: 'Truffle Pasta / Mains', url: GENERATED_IMAGES.trufflePasta },
  { label: 'Matcha Tiramisu / Dessert', url: GENERATED_IMAGES.matchaTiramisu },
];

export function MenuManager() {
  const {
    activeRestaurant,
    activeMenu,
    activeRole,
    toggleMenuItemAvailability,
    updateMenuItemPrice,
    addMenuItem,
    deleteMenuItem,
  } = usePlatform();

  const canEditPrices = canRoleEditMenuPrices(activeRole);
  const canToggleStock = canRoleToggleAvailability(activeRole);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Add dish form state
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Mains');
  const [newPrice, setNewPrice] = useState('320');
  const [newPrep, setNewPrep] = useState('15');
  const [newDesc, setNewDesc] = useState('');
  const [newVeg, setNewVeg] = useState(true);
  const [newImage, setNewImage] = useState(IMAGE_PRESETS[0].url);
  const [formError, setFormError] = useState<string | null>(null);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(activeMenu.map((m) => m.category)));
    return ['All', ...unique];
  }, [activeMenu]);

  const filteredMenu = useMemo(() => {
    return activeMenu.filter((item) => {
      const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
      const q = searchTerm.trim().toLowerCase();
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [activeMenu, selectedCategory, searchTerm]);

  const startPriceEdit = (id: string, currentPrice: number) => {
    setEditingPriceId(id);
    setPriceDraft(String(currentPrice));
  };

  const commitPriceEdit = (id: string) => {
    const parsed = Number(priceDraft);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100000) {
      updateMenuItemPrice(id, parsed);
    }
    setEditingPriceId(null);
  };

  const handleAddDish = (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = Number(newPrice);
    const prepNum = Number(newPrep);
    const validation = validateMenuItemInput({
      name: newName,
      category: newCategory,
      price: priceNum,
      description: newDesc,
      prepMinutes: prepNum,
    });
    if (!validation.valid) {
      setFormError(validation.error ?? 'Invalid dish details.');
      return;
    }

    addMenuItem({
      name: newName,
      category: newCategory,
      price: priceNum,
      description: newDesc || 'Freshly prepared to order.',
      veg: newVeg,
      prepMinutes: prepNum,
      imageUrl: newImage,
    });

    setFormError(null);
    setNewName('');
    setNewDesc('');
    setNewPrice('320');
    setShowAddForm(false);
  };

  const availableCount = activeMenu.filter((i) => i.available).length;

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Menu & Price Manager
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {availableCount} available · {activeMenu.length - availableCount} sold out · Every edit updates the customer QR menu immediately.
          </p>
        </div>

        {canEditPrices && (
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors whitespace-nowrap self-start"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Dish</span>
          </button>
        )}
      </div>

      {/* Add Dish Drawer/Panel */}
      {showAddForm && canEditPrices && (
        <form
          onSubmit={handleAddDish}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Add Dish to Digital Menu</h3>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              aria-label="Close add dish form"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {formError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="dish-name" className="block text-xs font-medium text-slate-700 mb-1">
                Dish Name
              </label>
              <input
                id="dish-name"
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Kashmiri Rogan Josh"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="dish-category" className="block text-xs font-medium text-slate-700 mb-1">
                Category
              </label>
              <input
                id="dish-category"
                type="text"
                required
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Starters, Mains, Breads..."
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="dish-price" className="block text-xs font-medium text-slate-700 mb-1">
                Price ({activeRestaurant.currency})
              </label>
              <input
                id="dish-price"
                type="number"
                min={0}
                max={100000}
                required
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="dish-desc" className="block text-xs font-medium text-slate-700 mb-1">
                Short Description
              </label>
              <input
                id="dish-desc"
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Ingredients, spice level, or serving style..."
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="dish-prep" className="block text-xs font-medium text-slate-700 mb-1">
                Prep Time (mins)
              </label>
              <input
                id="dish-prep"
                type="number"
                min={1}
                max={180}
                value={newPrep}
                onChange={(e) => setNewPrep(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="dish-photo" className="block text-xs font-medium text-slate-700 mb-1">
                Photo Style
              </label>
              <select
                id="dish-photo"
                value={newImage}
                onChange={(e) => setNewImage(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {IMAGE_PRESETS.map((p) => (
                  <option key={p.label} value={p.url}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={newVeg}
                onChange={(e) => setNewVeg(e.target.checked)}
                className="w-4 h-4 accent-emerald-600 rounded"
              />
              <span>Vegetarian dish</span>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="h-9 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
              >
                Save Dish Live
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Search & Category Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <label htmlFor="menu-search" className="sr-only">
            Search menu items
          </label>
          <input
            id="menu-search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search dish or category..."
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Staff-friendly high-clarity Menu Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/70">
                <th className="py-3.5 px-5">Dish</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4 text-right">Price</th>
                <th className="py-3.5 px-4 text-center">Live Availability</th>
                {canEditPrices && <th className="py-3.5 px-5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredMenu.map((item) => {
                const isEditing = editingPriceId === item.id;
                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${
                      item.available ? 'hover:bg-slate-50/60' : 'bg-slate-50/80'
                    }`}
                  >
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3.5 min-w-[240px]">
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className={`w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 ${
                            item.available ? '' : 'grayscale opacity-60'
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{item.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                            {item.veg ? 'Veg' : 'Non-Veg'} · {item.prepMinutes} min ·{' '}
                            {item.description}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {item.category}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      {isEditing ? (
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <input
                            type="number"
                            aria-label={`New price for ${item.name}`}
                            value={priceDraft}
                            onChange={(e) => setPriceDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitPriceEdit(item.id);
                              if (e.key === 'Escape') setEditingPriceId(null);
                            }}
                            autoFocus
                            className="w-24 h-8 px-2 rounded-md border border-emerald-600 text-right font-mono tabular-nums text-sm focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => commitPriceEdit(item.id)}
                            aria-label={`Save price for ${item.name}`}
                            className="p-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPriceId(null)}
                            aria-label={`Cancel editing price for ${item.name}`}
                            className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 justify-end">
                          <span className="font-mono tabular-nums font-semibold text-slate-900">
                            {formatCurrency(item.price, activeRestaurant.currency)}
                          </span>
                          {canEditPrices && (
                            <button
                              type="button"
                              onClick={() => startPriceEdit(item.id, item.price)}
                              aria-label={`Edit price of ${item.name}`}
                              className="p-1.5 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={item.available}
                        aria-label={`Toggle availability for ${item.name}`}
                        disabled={!canToggleStock}
                        onClick={() => toggleMenuItemAvailability(item.id)}
                        className={`inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50 ${
                          item.available
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                        }`}
                      >
                        <span
                          className={`w-7 h-4 rounded-full relative transition-colors ${
                            item.available ? 'bg-emerald-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                              item.available ? 'left-3.5' : 'left-0.5'
                            }`}
                          />
                        </span>
                        <span>{item.available ? 'In Stock' : 'Sold Out'}</span>
                      </button>
                    </td>

                    {canEditPrices && (
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => deleteMenuItem(item.id)}
                          aria-label={`Delete ${item.name}`}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
