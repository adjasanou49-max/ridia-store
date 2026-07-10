import { PaymentProvider } from '@prisma/client';
import { PaymentAdapter } from './PaymentAdapter';
import { CinetPayAdapter } from './CinetPayAdapter';
import { WaveAdapter } from './WaveAdapter';
import { OrangeMoneyAdapter } from './OrangeMoneyAdapter';
import { MtnMomoAdapter } from './MtnMomoAdapter';
import { CustomPaymentAdapter } from './CustomPaymentAdapter';

const registry: Record<string, PaymentAdapter> = {
  [PaymentProvider.CINETPAY]: new CinetPayAdapter(),
  [PaymentProvider.WAVE]: new WaveAdapter(),
  [PaymentProvider.ORANGE_MONEY]: new OrangeMoneyAdapter(),
  [PaymentProvider.MTN_MONEY]: new MtnMomoAdapter(),
  [PaymentProvider.CUSTOM]: new CustomPaymentAdapter(),
};

export function getPaymentAdapter(provider: PaymentProvider): PaymentAdapter {
  const adapter = registry[provider];
  if (!adapter) {
    throw new Error(`Aucun adapter de paiement trouvé pour: ${provider}`);
  }
  return adapter;
}

export function getAllPaymentAdapters(): PaymentAdapter[] {
  return Object.values(registry);
}
