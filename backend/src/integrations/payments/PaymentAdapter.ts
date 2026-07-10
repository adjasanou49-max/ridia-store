export interface InitiatePaymentParams {
  orderId: string;
  amountXof: number;
  customerPhone: string;
  customerName: string;
  description: string;
}

export interface InitiatePaymentResult {
  success: boolean;
  providerTxnId: string;
  paymentUrl?: string; // for redirect-based providers
  raw?: unknown;
}

export interface VerifyPaymentResult {
  success: boolean;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  providerTxnId: string;
  raw?: unknown;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  raw?: unknown;
}

export interface PaymentAdapter {
  readonly providerName: string;
  initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult>;
  verifyPayment(providerTxnId: string): Promise<VerifyPaymentResult>;
  handleWebhook(payload: unknown, signature?: string): Promise<VerifyPaymentResult>;
  /** Rembourse un paiement déjà confirmé - déclenché automatiquement lors de la résolution d'un litige */
  refundPayment(providerTxnId: string, amountXof: number): Promise<RefundResult>;
}
