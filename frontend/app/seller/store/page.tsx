'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { api } from '@/lib/api';

interface StoreProfile {
  id: string;
  storeName: string;
  storeSlug: string;
  storeDescription: string | null;
  storeLogoUrl: string | null;
  storeBannerUrl: string | null;
}

export default function SellerStorePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['seller', 'store'],
    queryFn: async () => (await api.get<StoreProfile>('/seller/store')).data,
  });

  if (isLoading || !data) return <p className="text-gray-400">Chargement...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Ma boutique</h1>
      <StoreForm initial={data} />
    </div>
  );
}

function StoreForm({ initial }: { initial: StoreProfile }) {
  const [form, setForm] = useState({
    storeName: initial.storeName,
    storeDescription: initial.storeDescription || '',
  });
  const [logoUrl, setLogoUrl] = useState(initial.storeLogoUrl || '');
  const [bannerUrl, setBannerUrl] = useState(initial.storeBannerUrl || '');
  const [uploading, setUploading] = useState<'logo' | 'banner' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function uploadImage(file: File, target: 'logo' | 'banner') {
    setUploading(target);
    try {
      const formData = new FormData();
      formData.append('images', file);
      const { data } = await api.post<{ urls: string[] }>('/upload/images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (target === 'logo') setLogoUrl(data.urls[0]);
      else setBannerUrl(data.urls[0]);
    } finally {
      setUploading(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api.patch('/seller/store', {
        storeName: form.storeName,
        storeDescription: form.storeDescription,
        storeLogoUrl: logoUrl || undefined,
        storeBannerUrl: bannerUrl || undefined,
      });
      setMessage('✅ Boutique mise à jour');
    } catch (err: any) {
      setMessage(`❌ ${err?.response?.data?.error || 'Erreur'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {message && <div className="text-sm p-3 rounded-lg bg-gray-50">{message}</div>}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="relative w-full h-40 bg-gray-100">
          {bannerUrl && <Image src={bannerUrl} alt="" fill className="object-cover" />}
          <label className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition cursor-pointer group">
            <span className="opacity-0 group-hover:opacity-100 flex items-center gap-2 text-white text-sm font-medium">
              <Camera size={16} /> {uploading === 'banner' ? 'Envoi...' : 'Changer la bannière'}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], 'banner')}
            />
          </label>
        </div>

        <div className="p-5 flex items-center gap-4">
          <div className="relative w-16 h-16 rounded-full bg-gray-100 overflow-hidden shrink-0 -mt-10 border-4 border-white">
            {logoUrl ? (
              <Image src={logoUrl} alt="" fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-xl font-semibold">
                {initial.storeName.charAt(0)}
              </div>
            )}
          </div>
          <label className="flex items-center gap-1 text-sm text-brand-600 font-medium cursor-pointer hover:underline">
            <Camera size={14} /> {uploading === 'logo' ? 'Envoi...' : 'Changer le logo'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0], 'logo')}
            />
          </label>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-gray-100 space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Nom de la boutique</label>
          <input
            value={form.storeName}
            onChange={(e) => setForm({ ...form, storeName: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            rows={3}
            value={form.storeDescription}
            onChange={(e) => setForm({ ...form, storeDescription: e.target.value })}
            placeholder="Présente ta boutique en quelques mots..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-2 rounded-lg text-sm disabled:opacity-50"
      >
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>
    </form>
  );
}
