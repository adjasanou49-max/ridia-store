'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatXof, formatDate } from '@/lib/utils';
import type { Order, OrderStatus } from '@/types';

const CANCELLABLE_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING'];

// Ordre logique du parcours normal d'une commande - sert à savoir jusqu'où
// remplir la timeline même si certaines étapes n'ont pas encore d'entrée
// dans statusHistory (ex: commande tout juste confirmée, pas encore expédiée).
const STATUS_FLOW: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'En attente de paiement',
  CONFIRMED: 'Paiement confirmé',
  PROCESSING: 'En préparation',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  REFUNDED: 'Remboursée',
  DISPUTED: 'En litige',
};

const STATUS_BADGE_STYLES: Record<OrderStatus, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  CONFIRMED: 'bg-blue-50 text-blue-700',
  PROCESSING: 'bg-amber-50 text-amber-700',
  SHIPPED: 'bg-sky-50 text-sky-700',
  DELIVERED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  REFUNDED: 'bg-gray-100 text-gray-500',
  DISPUTED: 'bg-red-50 text-red-700',
};

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Timeline visuelle du parcours de la commande. Les statuts terminaux
 * (annulée/remboursée/litige) sont affichés à part, pas dans le fil normal,
 * car ils sortent du parcours linéaire habituel.
 */
function OrderTimeline({ order }: { order: Order }) {
  const isOffTrack = ['CANCELLED', 'REFUNDED', 'DISPUTED'].includes(order.status);
  const currentIndex = STATUS_FLOW.indexOf(order.status);
  const historyByStatus = new Map((order.statusHistory ?? []).map((h) => [h.status, h]));

  if (isOffTrack) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
        <OrderStatusBadge status={order.status} />
        {historyByStatus.get(order.status)?.note && (
          <p className="text-sm text-gray-500 mt-2">{historyByStatus.get(order.status)?.note}</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
      <div className="flex items-center justify-between">
        {STATUS_FLOW.map((step, i) => {
          const reached = currentIndex >= i;
          const entry = historyByStatus.get(step);
          return (
            <div key={step} className="flex-1 flex flex-col items-center text-center relative">
              {i > 0 && (
                <div
                  className={`absolute top-3 right-1/2 w-full h-0.5 -z-0 ${
                    currentIndex >= i ? 'bg-brand-500' : 'bg-gray-200'
                  }`}
                />
              )}
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center z-10 ${
                  reached ? 'bg-brand-500' : 'bg-gray-200'
                }`}
              >
                {reached && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <p className={`text-xs mt-2 ${reached ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                {STATUS_LABELS[step]}
              </p>
              {entry && <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(entry.createdAt)}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [reviewingItemId, setReviewingItemId] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: async () => (await api.get<Order>(`/orders/${id}`)).data,
  });

  async function handleCancel() {
    if (!order || !confirm('Annuler cette commande ?')) return;
    setCancelling(true);
    try {
      await api.patch(`/orders/${order.id}/cancel`);
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } finally {
      setCancelling(false);
    }
  }

  if (isLoading) return <div className="max-w-3xl mx-auto px-4 py-16 text-gray-400">Chargement...</div>;
  if (!order) return <div className="max-w-3xl mx-auto px-4 py-16 text-gray-400">Commande introuvable.</div>;

  const canCancel = CANCELLABLE_STATUSES.includes(order.status);
  const canDispute = ['SHIPPED', 'DELIVERED'].includes(order.status);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Commande {order.orderNumber}</h1>
        <div className="flex items-center gap-3">
          {canDispute && (
            <button
              onClick={() => setShowDisputeForm((v) => !v)}
              className="text-sm text-orange-600 hover:underline"
            >
              Signaler un problème
            </button>
          )}
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="text-sm text-red-600 hover:underline disabled:opacity-50"
            >
              {cancelling ? 'Annulation...' : 'Annuler la commande'}
            </button>
          )}
        </div>
      </div>
      <p className="text-gray-500 mb-3">Passée le {formatDate(order.createdAt)}</p>
      <div className="mb-4">
        <OrderStatusBadge status={order.status} />
      </div>

      <OrderTimeline order={order} />

      {showDisputeForm && (
        <DisputeForm orderId={order.id} onDone={() => setShowDisputeForm(false)} />
      )}

      <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100 mb-6">
        {order.items.map((item) => (
          <div key={item.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{item.productName}</p>
                <p className="text-sm text-gray-500">Quantité: {item.quantity}</p>
                {item.trackingNumber && (
                  <p className="text-sm text-brand-600">Suivi: {item.trackingNumber}</p>
                )}
              </div>
              <p className="font-bold">{formatXof(item.totalXof)}</p>
            </div>

            {item.status === 'DELIVERED' && (
              <div className="mt-2">
                {reviewingItemId === item.id ? (
                  <ReviewForm
                    orderItemId={item.id}
                    onDone={() => {
                      setReviewingItemId(null);
                      queryClient.invalidateQueries({ queryKey: ['order', id] });
                    }}
                  />
                ) : (
                  <button
                    onClick={() => setReviewingItemId(item.id)}
                    className="text-xs text-brand-600 font-medium hover:underline"
                  >
                    Laisser un avis
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white p-5 rounded-xl border border-gray-100 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Sous-total</span>
          <span>{formatXof(order.subtotalXof)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Livraison</span>
          <span>{formatXof(order.shippingFeeXof)}</span>
        </div>
        <div className="flex justify-between font-bold text-lg border-t border-gray-100 pt-2">
          <span>Total</span>
          <span>{formatXof(order.totalXof)}</span>
        </div>
      </div>
    </div>
  );
}

function ReviewForm({ orderItemId, onDone }: { orderItemId: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handlePhotoAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      Array.from(files)
        .slice(0, 4 - imageUrls.length)
        .forEach((file) => formData.append('images', file));
      const { data } = await api.post<{ urls: string[] }>('/upload/images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImageUrls((prev) => [...prev, ...data.urls]);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      await api.post('/reviews', { orderItemId, rating, comment: comment || undefined, imageUrls, isAnonymous });
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-gray-50 rounded-lg p-3 mt-1 space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} className="text-lg leading-none">
            {n <= rating ? '★' : '☆'}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Ton avis sur ce produit (optionnel)"
        rows={2}
        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
      />

      {imageUrls.length > 0 && (
        <div className="flex gap-2">
          {imageUrls.map((url) => (
            <div key={url} className="relative w-14 h-14 rounded-lg overflow-hidden bg-white border border-gray-200">
              <Image src={url} alt="" fill className="object-cover" />
            </div>
          ))}
        </div>
      )}

      {imageUrls.length < 4 && (
        <label className="inline-flex items-center gap-1 text-xs text-brand-600 font-medium cursor-pointer hover:underline">
          {uploadingPhoto ? 'Envoi...' : '+ Ajouter des photos'}
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoAdd}
            disabled={uploadingPhoto}
            className="hidden"
          />
        </label>
      )}
      <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
        <input
          type="checkbox"
          checked={isAnonymous}
          onChange={(e) => setIsAnonymous(e.target.checked)}
        />
        Publier anonymement (ton nom n&apos;apparaîtra pas, juste &quot;Client&quot;)
      </label>
      <button
        onClick={submit}
        disabled={submitting}
        className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50"
      >
        {submitting ? 'Envoi...' : 'Publier l\'avis'}
      </button>
    </div>
  );
}

function DisputeForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [reason, setReason] = useState('Non reçu');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/orders/disputes', { orderId, reason, description });
      setDone(true);
      setTimeout(onDone, 1500);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="bg-green-50 text-green-700 text-sm p-4 rounded-lg mb-6">
        ✅ Ton signalement a été envoyé. Notre équipe va l&apos;examiner rapidement.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-white p-5 rounded-xl border border-orange-200 space-y-3 mb-6">
      <h2 className="font-semibold">Signaler un problème avec cette commande</h2>
      <div>
        <label className="block text-sm font-medium mb-1">Motif</label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option>Non reçu</option>
          <option>Produit endommagé</option>
          <option>Ne correspond pas à la description</option>
          <option>Article manquant</option>
          <option>Autre</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Décris le problème</label>
        <textarea
          required
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Explique ce qui s'est passé..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
      >
        {submitting ? 'Envoi...' : 'Envoyer le signalement'}
      </button>
    </form>
  );
}
