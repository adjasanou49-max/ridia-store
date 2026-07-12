import { nanoid } from 'nanoid';
import { OrderStatus, PaymentProvider, WalletTransactionType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';
import { getPaymentAdapter } from '../integrations/payments/PaymentProviderRegistry';
import { notificationQueue } from '../queues/notificationQueue';
import { productService } from './ProductService';
import { loyaltyService } from './LoyaltyService';
import { referralService } from './ReferralService';
import { couponService } from './CouponService';
import { walletService } from './WalletService';

const STOCK_RESERVATION_MINUTES = 30;

export class OrderService {
  /**
   * Ajoute un article au panier avec réservation de stock. Si l'article est
   * déjà dans le panier, `quantity` remplace la quantité existante (comportement
   * du frontend actuel) - on ne doit donc réserver/libérer que la différence
   * (delta), pas la nouvelle quantité en entier, sous peine de sur-réserver du
   * stock à chaque nouvel appel sur un même produit.
   *
   * Correction race condition : la disponibilité était vérifiée en lecture
   * (`product.stockQuantity - product.reservedStock`) puis `reservedStock`
   * était incrémenté séparément - deux ajouts simultanés pouvaient chacun
   * passer le contrôle et réserver plus que le stock réellement disponible.
   * La réservation est maintenant conditionnée directement dans l'écriture :
   * elle échoue proprement (au lieu de sur-réserver) si le stock disponible a
   * changé entre la lecture et l'écriture.
   */
  async addToCart(userId: string, productId: string, quantity: number, variantId?: string) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError('Produit non trouvé', 404);

    const expiresAt = new Date(Date.now() + STOCK_RESERVATION_MINUTES * 60 * 1000);

    const reservation = await prisma.$transaction(async (tx) => {
      const existing = await tx.cartItem.findUnique({
        where: {
          userId_productId_variantId: { userId, productId, variantId: variantId ?? '' } as any,
        },
      });
      const delta = quantity - (existing?.quantity ?? 0);

      if (delta > 0) {
        // Réservation atomique : n'incrémente que si assez de stock reste
        // disponible au moment précis de l'écriture, pour le delta uniquement.
        const claim = await tx.$executeRaw`
          UPDATE "Product"
          SET "reservedStock" = "reservedStock" + ${delta}
          WHERE id = ${productId} AND "stockQuantity" - "reservedStock" >= ${delta}
        `;

        if (claim === 0) {
          throw new AppError('Stock insuffisant', 422);
        }
      } else if (delta < 0) {
        // On réduit la quantité : libère la différence, toujours possible.
        await tx.product.update({
          where: { id: productId },
          data: { reservedStock: { decrement: -delta } },
        });
      }

      return tx.cartItem.upsert({
        where: {
          userId_productId_variantId: { userId, productId, variantId: variantId ?? '' } as any,
        },
        create: { userId, productId, variantId, quantity, reservedAt: new Date(), expiresAt },
        update: { quantity, reservedAt: new Date(), expiresAt },
      });
    });

    return reservation;
  }

  async getCart(userId: string) {
    return prisma.cartItem.findMany({
      where: { userId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            basePriceXof: true,
            stockQuantity: true,
            // Jamais exposé : costPriceCny, costPriceXof, marginPercent, exchangeRate,
            // originalName, originalDescription (données internes vendeur/traduction)
            images: { where: { isPrimary: true }, take: 1 },
            priceTiers: { orderBy: { minQuantity: 'asc' } },
          },
        },
        variant: true,
      },
    });
  }

  async removeCartItem(userId: string, cartItemId: string) {
    const item = await prisma.cartItem.findFirst({ where: { id: cartItemId, userId } });
    if (!item) throw new AppError('Article introuvable dans le panier', 404);

    await prisma.product.update({
      where: { id: item.productId },
      data: { reservedStock: { decrement: item.quantity } },
    });

    await prisma.cartItem.delete({ where: { id: cartItemId } });
  }

  /** Create order from cart, then initiate payment */
  async createOrderFromCart(
    userId: string,
    shippingAddressId: string,
    paymentProvider: PaymentProvider,
    customerPhone: string,
    customerName: string,
    couponCode?: string,
    pointsToRedeem?: number,
    walletAmountToUse?: number
  ) {
    const cartItems = await prisma.cartItem.findMany({
      where: { userId },
      include: {
        product: { include: { seller: true, priceTiers: { orderBy: { minQuantity: 'asc' } } } },
        variant: true,
      },
    });

    if (cartItems.length === 0) {
      throw new AppError('Le panier est vide', 422);
    }

    const subtotalXof = cartItems.reduce((sum, item) => {
      const unitPrice = item.variant?.priceXof
        ? Number(item.variant.priceXof)
        : productService.getUnitPriceForQuantity(item.product, item.quantity);
      return sum + unitPrice * item.quantity;
    }, 0);

    const shippingFeeXof = this.calculateShippingFee(cartItems.length);

    // Code promo optionnel - validé avant tout calcul final
    let discountXof = 0;
    let appliedCoupon: { id: string } | null = null;
    if (couponCode) {
      const result = await couponService.validate(couponCode, userId, subtotalXof);
      discountXof = result.discountXof;
      appliedCoupon = result.coupon;
    }

    // Points de fidélité optionnels - le montant est calculé ici pour le total,
    // mais les points ne sont réellement débités qu'une fois la commande confirmée
    // créée avec succès (voir plus bas, jamais avant).
    let pointsToActuallyRedeem = 0;
    if (pointsToRedeem && pointsToRedeem > 0) {
      const account = await loyaltyService.getOrCreateAccount(userId);
      const remainingAfterCoupon = subtotalXof + shippingFeeXof - discountXof;
      pointsToActuallyRedeem = Math.min(pointsToRedeem, account.pointsBalance, remainingAfterCoupon);
      discountXof += pointsToActuallyRedeem;
    }

    const totalXof = Math.max(0, subtotalXof + shippingFeeXof - discountXof);

    // Wallet optionnel - réduit le montant réellement à charger au prestataire
    // de paiement (voire l'annule complètement si le solde couvre tout).
    // Débité seulement après création réussie de la commande, jamais avant.
    let walletAmountToActuallyUse = 0;
    if (walletAmountToUse && walletAmountToUse > 0) {
      const walletBalance = await walletService.getBalance(userId);
      walletAmountToActuallyUse = Math.min(walletAmountToUse, walletBalance, totalXof);
    }
    const amountToChargeProvider = totalXof - walletAmountToActuallyUse;

    const orderNumber = `RID-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`;

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          userId,
          status: OrderStatus.PENDING,
          shippingAddressId,
          subtotalXof,
          shippingFeeXof,
          discountXof,
          couponCode: couponCode?.toUpperCase(),
          totalXof,
          items: {
            create: cartItems.map((item) => {
              const unitPrice = item.variant?.priceXof
                ? Number(item.variant.priceXof)
                : productService.getUnitPriceForQuantity(item.product, item.quantity);
              const lineTotal = unitPrice * item.quantity;
              const commission = lineTotal * (item.product.seller.commissionRate / 100);
              return {
                productId: item.productId,
                variantId: item.variantId,
                sellerId: item.product.sellerId,
                productName: item.product.name,
                unitPriceXof: unitPrice,
                quantity: item.quantity,
                totalXof: lineTotal,
                commissionXof: commission,
                sellerPayoutXof: lineTotal - commission,
              };
            }),
          },
          statusHistory: { create: { status: OrderStatus.PENDING, note: 'Commande créée' } },
        },
        include: {
          items: {
            select: {
              id: true,
              productId: true,
              productName: true,
              quantity: true,
              unitPriceXof: true,
              totalXof: true,
              status: true,
              // Jamais exposé au client : sellerId, commissionXof, sellerPayoutXof
            },
          },
        },
      });

      // Convert reserved stock into actual deduction
      for (const item of cartItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: { decrement: item.quantity },
            reservedStock: { decrement: item.quantity },
            salesCount: { increment: item.quantity },
          },
        });
      }

      await tx.cartItem.deleteMany({ where: { userId } });

      return newOrder;
    });

    if (appliedCoupon) {
      await couponService.recordUsage(appliedCoupon.id, userId, order.id);
    }

    if (pointsToActuallyRedeem > 0) {
      await loyaltyService.redeemPoints(userId, pointsToActuallyRedeem);
    }

    if (walletAmountToActuallyUse > 0) {
      await walletService.debit(
        userId,
        walletAmountToActuallyUse,
        WalletTransactionType.DEBIT_ORDER_PAYMENT,
        `Paiement commande ${orderNumber}`,
        order.id
      );
    }

    // Le wallet couvre la totalité du restant dû - aucun paiement externe à
    // initier, la commande est confirmée directement.
    if (amountToChargeProvider <= 0) {
      await prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.CONFIRMED,
            statusHistory: { create: { status: OrderStatus.CONFIRMED, note: 'Payée intégralement par le wallet' } },
          },
        }),
        prisma.payment.create({
          data: {
            orderId: order.id,
            provider: paymentProvider,
            amountXof: 0,
            providerTxnId: `WALLET-${order.id}`,
            status: 'SUCCEEDED',
            paidAt: new Date(),
          },
        }),
      ]);

      await notificationQueue.add('order-confirmed', {
        userId,
        orderNumber,
        totalXof: 0,
      });

      return { order, paymentUrl: null, providerTxnId: null };
    }

    // Initiate payment
    const adapter = getPaymentAdapter(paymentProvider);
    const paymentResult = await adapter.initiatePayment({
      orderId: order.id,
      amountXof: amountToChargeProvider,
      customerPhone,
      customerName,
      description: `Commande Ridia Store ${orderNumber}`,
    });

    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: paymentProvider,
        amountXof: amountToChargeProvider,
        providerTxnId: paymentResult.providerTxnId,
        status: paymentResult.success ? 'PROCESSING' : 'FAILED',
      },
    });

    return { order, paymentUrl: paymentResult.paymentUrl, providerTxnId: paymentResult.providerTxnId };
  }

  /**
   * Correction bug d'idempotence : les prestataires de paiement redélivrent
   * parfois leur webhook plusieurs fois pour la même transaction (comportement
   * documenté et attendu côté fournisseur, ex: en cas de timeout réseau). Sans
   * ce contrôle, chaque redélivrance renvoyait une notification de
   * confirmation en double au client et ajoutait une entrée dupliquée à
   * l'historique de statut.
   */
  async confirmPayment(providerTxnId: string) {
    const payment = await prisma.payment.findUnique({
      where: { providerTxnId },
      include: { order: { include: { user: true, items: true } } },
    });
    if (!payment) throw new AppError('Paiement introuvable', 404);

    if (payment.status === 'SUCCEEDED') {
      return { status: 'SUCCEEDED', success: true, providerTxnId }; // déjà traité - webhook redélivré
    }

    const adapter = getPaymentAdapter(payment.provider);
    const result = await adapter.verifyPayment(providerTxnId);

    if (result.status === 'SUCCEEDED') {
      await prisma.$transaction([
        prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'SUCCEEDED', paidAt: new Date() },
        }),
        prisma.order.update({
          where: { id: payment.orderId },
          data: {
            status: OrderStatus.CONFIRMED,
            statusHistory: { create: { status: OrderStatus.CONFIRMED, note: 'Paiement confirmé' } },
          },
        }),
      ]);

      await notificationQueue.add('order-confirmed', {
        userId: payment.order.userId,
        orderNumber: payment.order.orderNumber,
        totalXof: Number(payment.order.totalXof),
      });

      // Pas d'API fournisseur automatique - un agent humain place la commande
      // manuellement chez le fournisseur. Les articles apparaissent
      // automatiquement dans l'écran de suivi agent (/admin/order-fulfillment)
      // dès que la commande est confirmée, avec le lien produit source visible.
    } else if (result.status === 'FAILED') {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    }

    return result;
  }

  async updateOrderStatus(orderId: string, status: OrderStatus, note?: string) {
    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        ...(status === OrderStatus.DELIVERED && { deliveredAt: new Date() }),
        statusHistory: { create: { status, note } },
      },
    });

    // À la livraison : points de fidélité + récompense parrainage (si première commande)
    if (status === OrderStatus.DELIVERED) {
      await loyaltyService.awardPointsForOrder(order.userId, order.id, Number(order.totalXof));
      await referralService.rewardReferrerOnFirstOrder(order.userId);
    }

    return order;
  }

  private calculateShippingFee(itemCount: number): number {
    // Simple flat + per-item model; refine with real carrier rates later
    const base = 2000; // XOF
    const perItem = 500;
    return base + perItem * Math.max(0, itemCount - 1);
  }

  /** Vue admin complète - inclut commission/payout, réservée à l'équipe interne (jamais au client) */
  async getOrderByIdAdmin(orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId },
      include: {
        items: { include: { product: { select: { name: true, images: { take: 1 } } }, seller: { select: { storeName: true } } } },
        payments: true,
        shippingAddress: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        user: { select: { firstName: true, lastName: true, email: true, phone: true } },
      },
    });
    if (!order) throw new AppError('Commande non trouvée', 404);
    return order;
  }

  async getOrderById(orderId: string, userId?: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, ...(userId && { userId }) },
      include: {
        items: {
          select: {
            id: true,
            productId: true,
            variantId: true,
            productName: true,
            quantity: true,
            unitPriceXof: true,
            totalXof: true,
            status: true,
            trackingNumber: true,
            shippedAt: true,
            deliveredAt: true,
            // Jamais exposés au client : sellerId, commissionXof, sellerPayoutXof
            // (données financières internes Ridia/vendeur)
            product: { select: { images: { take: 1, select: { url: true } } } },
          },
        },
        payments: {
          select: { id: true, provider: true, status: true, amountXof: true, paidAt: true },
          // Jamais exposé : metadata (peut contenir des références internes provider)
        },
        shippingAddress: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new AppError('Commande non trouvée', 404);
    return order;
  }

  async getUserOrders(userId: string, page = 1, pageSize = 20) {
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          items: {
            take: 3,
            select: {
              id: true,
              productId: true,
              productName: true,
              quantity: true,
              unitPriceXof: true,
              totalXof: true,
              status: true,
              product: { select: { images: { take: 1, select: { url: true } } } },
            },
          },
          payments: { select: { status: true, provider: true } },
        },
      }),
      prisma.order.count({ where: { userId } }),
    ]);
    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  /** Annulation par le client - seulement possible avant expédition, remet le stock en vente */
  /**
   * Correction bug critique : l'annulation d'une commande dont le paiement
   * avait déjà réussi (statut CONFIRMED ou PROCESSING) remettait le stock en
   * vente et marquait la commande annulée, mais ne déclenchait JAMAIS le
   * remboursement réel chez le prestataire de paiement - l'argent du client
   * restait débité sans qu'aucun remboursement automatique n'ait lieu.
   */
  async cancelOrder(orderId: string, userId: string, reason?: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: true,
        payments: { where: { status: 'SUCCEEDED' }, orderBy: { paidAt: 'desc' }, take: 1 },
      },
    });
    if (!order) throw new AppError('Commande non trouvée', 404);

    const cancellableStatuses: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING'];
    if (!cancellableStatuses.includes(order.status)) {
      throw new AppError(
        'Cette commande ne peut plus être annulée - elle est déjà en cours de livraison',
        422
      );
    }

    const paymentToRefund = order.payments[0];

    await prisma.$transaction(async (tx) => {
      // Remet le stock vendu en vente
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: { increment: item.quantity },
            salesCount: { decrement: item.quantity },
          },
        });
      }

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          statusHistory: { create: { status: 'CANCELLED', note: reason || 'Annulée par le client' } },
        },
      });

      await tx.orderItem.updateMany({
        where: { orderId },
        data: { status: 'CANCELLED' },
      });
    });

    // Remboursement réel hors transaction (appel externe au prestataire) - la
    // commande est déjà annulée dans tous les cas ; si le remboursement échoue
    // ou n'est pas disponible pour ce prestataire (ex: Orange Money, désactivé
    // temporairement), le montant est crédité au wallet du client en solution
    // de secours plutôt que de laisser l'argent simplement perdu pour lui.
    if (paymentToRefund?.providerTxnId) {
      let refunded = false;
      try {
        const adapter = getPaymentAdapter(paymentToRefund.provider);
        const result = await adapter.refundPayment(paymentToRefund.providerTxnId, Number(order.totalXof));
        if (result.success) {
          await prisma.payment.update({ where: { id: paymentToRefund.id }, data: { status: 'REFUNDED' } });
          refunded = true;
        } else {
          logger.error('Remboursement automatique échoué côté prestataire (annulation)', {
            orderId,
            provider: paymentToRefund.provider,
          });
        }
      } catch (err: any) {
        logger.error('Erreur lors du remboursement automatique (annulation)', {
          orderId,
          error: err.message,
        });
      }

      if (!refunded) {
        await walletService.refundOrderToWallet(userId, orderId, Number(order.totalXof), order.orderNumber);
        await prisma.payment.update({ where: { id: paymentToRefund.id }, data: { status: 'REFUNDED' } });
      }
    }
  }

  /** Commandes contenant des articles du vendeur connecté */
  async getSellerOrderItems(sellerId: string, page = 1, pageSize = 30) {
    const [items, total] = await Promise.all([
      prisma.orderItem.findMany({
        where: { sellerId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          order: { select: { orderNumber: true, status: true, createdAt: true, shippingAddress: true } },
          product: { select: { name: true, images: { take: 1 } } },
        },
      }),
      prisma.orderItem.count({ where: { sellerId } }),
    ]);
    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  /** Le vendeur marque son article comme expédié + numéro de suivi */
  async shipOrderItem(orderItemId: string, sellerId: string, trackingNumber: string) {
    const item = await prisma.orderItem.findFirst({ where: { id: orderItemId, sellerId } });
    if (!item) throw new AppError('Article de commande non trouvé', 404);

    const updated = await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { status: 'SHIPPED', trackingNumber, shippedAt: new Date() },
      include: { order: true },
    });

    await notificationQueue.add('order-shipped', {
      userId: updated.order.userId,
      orderNumber: updated.order.orderNumber,
      trackingNumber,
    });

    return updated;
  }

  /** Admin : changement de statut global d'une commande (ex: DELIVERED) */
  async adminUpdateOrderStatus(orderId: string, status: OrderStatus, note?: string) {
    return this.updateOrderStatus(orderId, status, note);
  }

  async listAllOrders(status?: OrderStatus, page = 1, pageSize = 30) {
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      prisma.order.count({ where }),
    ]);
    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }
}

export const orderService = new OrderService();
