import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  createMoneyAmount,
  nowUtcIso8601,
  type PaymentCheckoutPreviewRequest,
  type PaymentCheckoutPreviewResult,
  type PaymentWebhookEvent,
  type PlanDefinition,
} from '@cuex/protocol';
import { HttpServiceError } from '../security';
import { resolvePlanPriceFen } from './PlanCatalog';

export interface PaymentProviderAdapter {
  previewCheckout(
    plan: PlanDefinition,
    request: PaymentCheckoutPreviewRequest,
  ): PaymentCheckoutPreviewResult;
  verifyWebhookSignature(rawBody: Buffer | string, signatureHeader?: string): void;
  validateWebhookProvider?(providerParam?: string, event?: PaymentWebhookEvent): void;
}

/**
 * Honest sandbox-only payment adapter.
 * Computes exact Fen checkout previews without faking live gateway settlements, and enforces
 * HMAC-SHA256 webhook signatures + 501 PAYMENT_NOT_CONFIGURED when webhook secret is absent.
 */
export class SandboxPaymentProviderAdapter implements PaymentProviderAdapter {
  constructor(private readonly webhookSecret?: string) {}

  previewCheckout(
    plan: PlanDefinition,
    request: PaymentCheckoutPreviewRequest,
  ): PaymentCheckoutPreviewResult {
    if (plan.status === 'planned') {
      throw new HttpServiceError(
        'VALIDATION_ERROR',
        `Plan "${plan.planId}" is currently in planned status and cannot be checked out.`,
      );
    }

    const subtotalFen = resolvePlanPriceFen(plan, request.billingCycle);
    const coupon = request.couponCode?.trim().toUpperCase();
    const discountFen =
      coupon === 'CUEXBETA20' ? Math.floor((subtotalFen * 20) / 100) : 0;
    const totalFen = Math.max(0, subtotalFen - discountFen);

    return {
      previewId: `prev_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      planId: plan.planId,
      planStatus: plan.status,
      billingCycle: request.billingCycle,
      paymentChannel: request.paymentChannel,
      mode: this.webhookSecret ? 'sandbox_only' : 'not_configured',
      subtotal: createMoneyAmount(subtotalFen),
      discount: createMoneyAmount(discountFen),
      total: createMoneyAmount(totalFen),
      liveCheckoutAvailable: false,
      notice:
        '当前为商业化沙箱预览（Pricing Hypothesis）：未接入真实微信支付/支付宝收单，仅输出分（Fen）级计费明细；需在服务端配置真实收单商户及 CUEX_WEBHOOK_SECRET 后方可正式开通线上扣款。',
      createdAt: nowUtcIso8601(),
    };
  }

  verifyWebhookSignature(rawBody: Buffer | string, signatureHeader?: string): void {
    const secret = this.webhookSecret?.trim();
    if (!secret) {
      throw new HttpServiceError(
        'PAYMENT_NOT_CONFIGURED',
        'Payment webhook handling is not configured (CUEX_WEBHOOK_SECRET is missing).',
        { httpStatus: 501 },
      );
    }

    const providedRaw = signatureHeader?.trim();
    if (!providedRaw) {
      throw new HttpServiceError('UNAUTHORIZED', 'Missing webhook HMAC signature header.');
    }

    const providedHex = providedRaw.replace(/^sha256=/i, '').toLowerCase();
    const expectedHex = createHmac('sha256', secret)
      .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
      .digest('hex')
      .toLowerCase();

    const providedBuf = Buffer.from(providedHex, 'utf8');
    const expectedBuf = Buffer.from(expectedHex, 'utf8');
    if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
      throw new HttpServiceError('UNAUTHORIZED', 'Invalid payment webhook HMAC signature.');
    }
  }
}
