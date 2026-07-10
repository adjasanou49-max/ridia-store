import sgMail from '@sendgrid/mail';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

if (env.SENDGRID.mode === 'live' && env.SENDGRID.apiKey) {
  sgMail.setApiKey(env.SENDGRID.apiKey);
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
    const html = `
      <h2>Merci pour votre commande sur Ridia Store!</h2>
      <p>Votre commande <strong>${orderNumber}</strong> a été confirmée.</p>
      <p>Total: <strong>${totalXof.toLocaleString('fr-FR')} FCFA</strong></p>
      <p>Nous vous notifierons dès l'expédition de votre colis.</p>
    `;
    await this.sendEmail(to, `Confirmation de commande ${orderNumber}`, html);
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    const html = `
      <h2>Réinitialisation de mot de passe</h2>
      <p>Tu as demandé à réinitialiser ton mot de passe Ridia Store.</p>
      <p><a href="${resetUrl}">Clique ici pour choisir un nouveau mot de passe</a></p>
      <p>Ce lien expire dans 1 heure. Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>
    `;
    await this.sendEmail(to, 'Réinitialisation de ton mot de passe Ridia Store', html);
  }

  async sendWelcomeEmail(to: string, firstName: string): Promise<void> {
    const html = `
      <h2>Bienvenue sur Ridia Store, ${firstName}!</h2>
      <p>Ton compte est prêt. Découvre dès maintenant nos produits.</p>
    `;
    await this.sendEmail(to, 'Bienvenue sur Ridia Store', html);
  }
}

export const sendGridAdapter = new SendGridAdapter();
