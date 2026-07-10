'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Camera } from 'lucide-react';
import { api } from '@/lib/api';
import type { User } from '@/types';

export function ProfileTab({ user }: { user: User }) {
  const [form, setForm] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone || '',
  });
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('images', file);
      const { data } = await api.post<{ urls: string[] }>('/upload/images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = data.urls[0];
      setAvatarUrl(url);
      await api.patch('/auth/profile', { avatarUrl: url });
      setMessage('✅ Photo de profil mise à jour');
    } catch (err: any) {
      setMessage(`❌ ${err?.response?.data?.error || "Erreur lors de l'upload"}`);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api.patch('/auth/profile', form);
      setMessage('✅ Profil mis à jour');
    } catch (err: any) {
      setMessage(`❌ ${err?.response?.data?.error || 'Erreur'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-5 rounded-xl border border-gray-100 flex items-center gap-4">
        <div className="relative w-16 h-16 rounded-full bg-gray-100 overflow-hidden shrink-0">
          {avatarUrl ? (
            <Image src={avatarUrl} alt="" fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xl font-semibold">
              {user.firstName.charAt(0)}
            </div>
          )}
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-brand-600 cursor-pointer hover:underline">
            <Camera size={15} />
            {uploadingAvatar ? 'Envoi...' : 'Changer la photo'}
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              disabled={uploadingAvatar}
              className="hidden"
            />
          </label>
          <p className="text-xs text-gray-400 mt-0.5">JPG ou PNG, 8 Mo maximum</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-5 rounded-xl border border-gray-100 space-y-4">
        {message && <div className="text-sm p-3 rounded-lg bg-gray-50">{message}</div>}

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Prénom</label>
            <input
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nom</label>
            <input
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            disabled
            value={user.email}
            className="w-full border border-gray-200 bg-gray-50 text-gray-500 rounded-lg px-3 py-2 text-sm cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">
            L&apos;email ne peut pas être modifié pour le moment. Contacte le support si besoin.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Téléphone (WhatsApp)</label>
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+226 XX XX XX XX"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          {saving ? 'Sauvegarde...' : 'Enregistrer'}
        </button>
      </form>

      <VerificationCard user={user} />
    </div>
  );
}

function VerificationCard({ user }: { user: User }) {
  const [emailSent, setEmailSent] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function sendEmailVerification() {
    await api.post('/auth/send-email-verification');
    setEmailSent(true);
  }

  async function sendPhoneOtp() {
    await api.post('/auth/send-phone-otp');
    setOtpSent(true);
  }

  async function verifyOtp() {
    setMessage(null);
    try {
      await api.post('/auth/verify-phone-otp', { code: otpCode });
      setMessage('✅ Téléphone vérifié !');
      setOtpSent(false);
    } catch (err: any) {
      setMessage(`❌ ${err?.response?.data?.error || 'Code incorrect'}`);
    }
  }

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-100 space-y-4">
      <h2 className="font-semibold">Vérifications</h2>
      {message && <div className="text-sm p-3 rounded-lg bg-gray-50">{message}</div>}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Email</p>
          <p className="text-xs text-gray-400">{user.email}</p>
        </div>
        {user.emailVerified ? (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Vérifié</span>
        ) : emailSent ? (
          <span className="text-xs text-gray-400">Email envoyé, vérifie ta boîte de réception</span>
        ) : (
          <button onClick={sendEmailVerification} className="text-xs text-brand-600 font-medium hover:underline">
            Vérifier
          </button>
        )}
      </div>

      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-medium">Téléphone</p>
            <p className="text-xs text-gray-400">{user.phone || 'Non renseigné'}</p>
          </div>
          {user.phoneVerified ? (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Vérifié</span>
          ) : !otpSent ? (
            <button
              onClick={sendPhoneOtp}
              disabled={!user.phone}
              className="text-xs text-brand-600 font-medium hover:underline disabled:opacity-40"
            >
              Envoyer un code
            </button>
          ) : null}
        </div>

        {otpSent && !user.phoneVerified && (
          <div className="flex items-center gap-2 mt-2">
            <input
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              placeholder="Code à 6 chiffres"
              maxLength={6}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-32"
            />
            <button
              onClick={verifyOtp}
              className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
            >
              Confirmer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
