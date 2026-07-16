import PDFDocument from 'pdfkit';
import type { PassThrough } from 'stream';
import { PassThrough as Stream } from 'stream';
import type { Prisma } from '@prisma/client';

// Les montants viennent directement de Prisma (type Decimal), jamais de
// simples number - Number(decimalInstance) fonctionne bien au runtime
// (comme partout ailleurs dans ce code), mais le type doit l'accepter
// explicitement pour que TypeScript ne râle pas.
type Money = Prisma.Decimal | number | string;

interface InvoiceOrder {
  orderNumber: string;
  createdAt: Date;
  status: string;
  subtotalXof: Money;
  shippingFeeXof: Money;
  discountXof: Money;
  totalXof: Money;
  couponCode: string | null;
  shippingAddress: {
    fullName: string;
    phone: string;
    country: string;
    city: string;
    district: string | null;
    streetLine1: string;
    streetLine2: string | null;
  };
  items: {
    productName: string;
    quantity: number;
    unitPriceXof: Money;
    totalXof: Money;
  }[];
  payments: { provider: string; status: string; amountXof: Money }[];
}

interface TaxSettings {
  businessIfu: string | null;
  tvaEnabled: boolean;
  tvaRatePercent: number;
}

const STATUS_LABELS_FR: Record<string, string> = {
  PENDING: 'En attente de paiement',
  CONFIRMED: 'Confirmée',
  PROCESSING: 'En préparation',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  REFUNDED: 'Remboursée',
  DISPUTED: 'Litige en cours',
};

function formatXof(amount: Money): string {
  const n = Number(amount);
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

/**
 * Génère une facture PDF simple pour une commande. Volontairement sobre
 * (pas de logo embarqué - Ridia Store n'a pas encore de charte graphique
 * figée pour les documents imprimés) mais complète : toutes les mentions
 * qu'un client ou un service comptable attend d'un vrai reçu.
 *
 * IFU affiché dans l'en-tête dès qu'il est configuré (arrêté N°2005-766/MFB/
 * SG/DGI, obligatoire sur tout document professionnel).
 *
 * TVA : désactivée par défaut (voir /admin/settings). Si activée, elle est
 * calculée par EXTRACTION sur le montant produits déjà payé (méthode "TTC"),
 * jamais ajoutée en plus du total ni appliquée aux frais de livraison - le
 * client a déjà payé exactement `order.totalXof`, la facture ne fait
 * qu'expliciter la part de TVA contenue dans ce montant, elle ne le change pas.
 */
export function generateInvoicePdf(order: InvoiceOrder, tax: TaxSettings): PassThrough {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const stream: PassThrough = new Stream();
  doc.pipe(stream);

  // En-tête
  doc.fontSize(20).font('Helvetica-Bold').fillColor('#f97316').text('Ridia Store', 50, 50);
  doc.fontSize(9).font('Helvetica').fillColor('#666666').text('Marketplace en ligne', 50, 75);
  if (tax.businessIfu) {
    doc.fontSize(8).fillColor('#888888').text(`IFU : ${tax.businessIfu}`, 50, 90);
  }

  doc
    .fontSize(16)
    .font('Helvetica-Bold')
    .fillColor('#111111')
    .text('FACTURE', 400, 50, { align: 'right' });
  doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor('#333333')
    .text(`N° ${order.orderNumber}`, 400, 75, { align: 'right' })
    .text(`Date : ${order.createdAt.toLocaleDateString('fr-FR')}`, 400, 90, { align: 'right' })
    .text(`Statut : ${STATUS_LABELS_FR[order.status] ?? order.status}`, 400, 105, { align: 'right' });

  doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#eeeeee').stroke();

  // Facturé à
  const addr = order.shippingAddress;
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#111111').text('Facturé à', 50, 145);
  doc
    .font('Helvetica')
    .fillColor('#333333')
    .text(addr.fullName, 50, 160)
    .text(addr.phone, 50, 174)
    .text(
      [addr.streetLine1, addr.streetLine2, addr.district, addr.city, addr.country].filter(Boolean).join(', '),
      50,
      188,
      { width: 300 }
    );

  // Tableau des articles
  let y = 250;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#666666');
  doc.text('Article', 50, y);
  doc.text('Qté', 320, y, { width: 40, align: 'right' });
  doc.text('Prix unitaire', 370, y, { width: 90, align: 'right' });
  doc.text('Total', 470, y, { width: 75, align: 'right' });
  y += 15;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#eeeeee').stroke();
  y += 10;

  doc.font('Helvetica').fontSize(9).fillColor('#333333');
  for (const item of order.items) {
    doc.text(item.productName, 50, y, { width: 260 });
    doc.text(String(item.quantity), 320, y, { width: 40, align: 'right' });
    doc.text(formatXof(item.unitPriceXof), 370, y, { width: 90, align: 'right' });
    doc.text(formatXof(item.totalXof), 470, y, { width: 75, align: 'right' });
    y += 20;
  }

  y += 10;
  doc.moveTo(320, y).lineTo(545, y).strokeColor('#eeeeee').stroke();
  y += 15;

  const totalsLine = (label: string, value: string, bold = false) => {
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(bold ? 11 : 9)
      .fillColor(bold ? '#111111' : '#666666')
      .text(label, 320, y, { width: 130, align: 'left' })
      .text(value, 470, y, { width: 75, align: 'right' });
    y += bold ? 20 : 16;
  };

  totalsLine('Sous-total', formatXof(order.subtotalXof));
  if (Number(order.discountXof) > 0) {
    totalsLine('Remise' + (order.couponCode ? ` (${order.couponCode})` : ''), `-${formatXof(order.discountXof)}`);
  }
  if (tax.tvaEnabled) {
    // Base TVA = produits nets uniquement (sous-total - remise), jamais la
    // livraison. Extraction (le client a déjà payé ce montant TTC) : on
    // n'ajoute rien au total, on explicite juste la part de TVA incluse.
    const productsNetXof = Number(order.subtotalXof) - Number(order.discountXof);
    const htXof = productsNetXof / (1 + tax.tvaRatePercent / 100);
    const tvaXof = productsNetXof - htXof;
    totalsLine(`Dont TVA (${tax.tvaRatePercent}%, produits uniquement)`, formatXof(tvaXof));
  }
  totalsLine('Livraison', Number(order.shippingFeeXof) > 0 ? formatXof(order.shippingFeeXof) : 'Gratuite');
  y += 5;
  doc.moveTo(320, y).lineTo(545, y).strokeColor('#111111').stroke();
  y += 10;
  totalsLine('Total', formatXof(order.totalXof), true);

  // Paiement
  if (order.payments.length > 0) {
    y += 20;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text('Paiement', 50, y);
    y += 15;
    for (const p of order.payments) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#333333')
        .text(`${p.provider} - ${formatXof(p.amountXof)} - ${p.status}`, 50, y);
      y += 14;
    }
  }

  // Pied de page
  doc
    .fontSize(8)
    .fillColor('#999999')
    .text(
      tax.businessIfu
        ? 'Ridia Store - Document généré automatiquement.'
        : "Ridia Store - Document généré automatiquement, ne constitue pas une facture fiscale certifiée tant que le régime fiscal de l'entreprise n'est pas enregistré.",
      50,
      760,
      { width: 495, align: 'center' }
    );

  doc.end();
  return stream;
}
