import sgMail from '@sendgrid/mail';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

if (env.SENDGRID.mode === 'live' && env.SENDGRID.apiKey) {
  sgMail.setApiKey(env.SENDGRID.apiKey);
}

/**
 * Enveloppe HTML commune à tous les emails transactionnels - un en-tête avec
 * le logo/nom de marque, un pied de page, et une largeur fixe adaptée aux
 * clients mail mobiles (Gmail, Outlook mobile) qui ignorent les media queries.
 * `bodyHtml` est le contenu spécifique de chaque email (voir méthodes plus bas).
 */
function brandedEmail(bodyHtml: string, ctaLabel?: string, ctaUrl?: string): string {
  const cta =
    ctaLabel && ctaUrl
      ? `<tr><td style="padding: 24px 32px 8px;">
           <a href="${ctaUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;
             font-weight:600;padding:12px 24px;border-radius:8px;font-size:15px;">${ctaLabel}</a>
         </td></tr>`
      : '';

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#16a34a;padding:20px 32px;">
        <span style="color:#ffffff;font-size:20px;font-weight:700;">Ridia Store</span>
      </td></tr>
      <tr><td style="padding:32px 32px 8px;color:#18181b;font-size:15px;line-height:1.6;">
        ${bodyHtml}
      </td></tr>
      ${cta}
      <tr><td style="padding:24px 32px 32px;color:#a1a1aa;font-size:12px;border-top:1px solid #f4f4f5;margin-top:16px;">
        Ridia Store — la marketplace qui livre la Chine chez vous.<br/>
        Cet email t'a été envoyé car tu as un compte sur Ridia Store.
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

export class SendGridAdapter {
  private get isMock() {
    return env.SENDGRID.mode !== 'live';
  }

  async sendEmail(to: string, subject: string, html: string): Promise<{ success: boolean }> {
    if (this.isMock) {
      logger.info('[SendGrid MOCK] Sending email', { to, subject });
      return { success: true };
    }

    try {
      await sgMail.send({
        to,
        from: env.SENDGRID.fromEmail,
        subject,
        html,
      });
      return { success: true };
    } catch (err: any) {
      logger.error('SendGrid send error', { error: err.message });
      return { success: false };
    }
  }

  async sendOrderConfirmation(to: string, orderNumber: string, totalXof: number): Promise<void> {
    const body = `
      <h2 style="margin:0 0 12px;font-size:19px;">Merci pour ta commande !</h2>
      <p style="margin:0 0 8px;">Ta commande <strong>${orderNumber}</strong> a été confirmée.</p>
      <p style="margin:0 0 8px;">Total : <strong>${totalXof.toLocaleString('fr-FR')} FCFA</strong></p>
      <p style="margin:16px 0 0;color:#52525b;">On te notifiera dès l'expédition de ton colis.</p>
    `;
    const url = `${env.FRONTEND_URL}/orders`;
    await this.sendEmail(
      to,
      `Confirmation de commande ${orderNumber}`,
      brandedEmail(body, 'Suivre ma commande', url)
    );
  }

  /**
   * Envoyée en complément du WhatsApp (voir NotificationService.notifyOrderShipped) -
   * certains clients n'ont pas de numéro enregistré ou préfèrent l'email, ils ne
   * doivent jamais rater une notification d'expédition faute de canal disponible.
   */
  async sendShippingNotification(to: string, orderNumber: string, trackingNumber: string): Promise<void> {
    const body = `
      <h2 style="margin:0 0 12px;font-size:19px;">Ta commande est en route ! 📦</h2>
      <p style="margin:0 0 8px;">La commande <strong>${orderNumber}</strong> vient d'être expédiée.</p>
      <p style="margin:0 0 8px;">Numéro de suivi : <strong>${trackingNumber}</strong></p>
      <p style="margin:16px 0 0;color:#52525b;">Tu peux suivre son avancement depuis ton compte à tout moment.</p>
    `;
    const url = `${env.FRONTEND_URL}/orders`;
    await this.sendEmail(
      to,
      `Commande expédiée - ${orderNumber}`,
      brandedEmail(body, 'Suivre ma livraison', url)
    );
  }

  /** Demande d'avis 3 jours après livraison (voir NotificationService.notifyReviewRequest). */
  async sendReviewRequest(to: string, orderNumber: string): Promise<void> {
    const body = `
      <h2 style="margin:0 0 12px;font-size:19px;">Comment s'est passée ta commande ? 🌟</h2>
      <p style="margin:0 0 8px;">Ta commande <strong>${orderNumber}</strong> a été livrée il y a quelques jours.</p>
      <p style="margin:16px 0 0;color:#52525b;">Ton avis aide les autres clients à faire leur choix - ça ne prend qu'une minute.</p>
    `;
    const url = `${env.FRONTEND_URL}/orders`;
    await this.sendEmail(to, `Laisse ton avis - ${orderNumber}`, brandedEmail(body, 'Laisser un avis', url));
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    const body = `
      <h2 style="margin:0 0 12px;font-size:19px;">Réinitialisation de mot de passe</h2>
      <p style="margin:0 0 8px;">Tu as demandé à réinitialiser ton mot de passe Ridia Store.</p>
      <p style="margin:16px 0 0;color:#52525b;">Si tu n'es pas à l'origine de cette demande, ignore simplement cet email - ton mot de passe restera inchangé. Ce lien expire dans 1 heure.</p>
    `;
    await this.sendEmail(
      to,
      'Réinitialisation de ton mot de passe Ridia Store',
      brandedEmail(body, 'Réinitialiser mon mot de passe', resetUrl)
    );
  }

  async sendWelcomeEmail(to: string, firstName: string): Promise<void> {
    const body = `
      <h2 style="margin:0 0 12px;font-size:19px;">Bienvenue sur Ridia Store, ${firstName} !</h2>
      <p style="margin:0 0 8px;">Ton compte est prêt. Découvre dès maintenant nos produits à prix directs Chine.</p>
    `;
    await this.sendEmail(
      to,
      'Bienvenue sur Ridia Store',
      brandedEmail(body, 'Découvrir les produits', env.FRONTEND_URL)
    );
  }
}

export const sendGridAdapter = new SendGridAdapter();
