import { Injectable } from '@nestjs/common';
import { TransportQuote, TransportService } from './transport.service';

export type PricingBreakdown = {
  currency: 'BRL';
  creatorBasePrice: number;
  distanceKm: number;
  transportFee: number;
  transport: TransportQuote;
  /** Taxa da plataforma descontada do creator (não somada ao total pago pela empresa). */
  platformFee: number;
  platformFeeRate: number;
  /** Valor total pago pela empresa: creatorBasePrice + transportFee. */
  totalPrice: number;
  totalAmount: number;
  transportPricePerKmUsed: number;
  transportMinimumFeeUsed: number;
};

type BuildPricingParams = {
  creatorBasePrice: number;
  distanceKm: number;
  transportPricePerKm: number;
  transportMinimumFee: number;
  /** Taxa da plataforma (ex: 0.15 = 15%). Default 0 — backward-compatible. */
  platformFeeRate?: number;
};

@Injectable()
export class PricingService {
  constructor(private readonly transportService: TransportService) {}

  buildPricing(params: BuildPricingParams): PricingBreakdown {
    const transport = this.transportService.buildQuote({
      distanceKm: params.distanceKm,
      pricePerKm: params.transportPricePerKm,
      minimumPrice: params.transportMinimumFee,
      currency: 'BRL',
    });

    if (!transport) {
      throw new Error('Nao foi possivel calcular o transporte sem distancia valida.');
    }

    const rate = params.platformFeeRate ?? 0;
    const platformFee = this.roundToTwoDecimals(params.creatorBasePrice * rate);
    const transportFee = transport.price;
    // Empresa paga: creatorBasePrice + transportFee.
    // platformFee é descontado internamente do repasse ao creator — não entra no total.
    const totalAmount = this.roundToTwoDecimals(params.creatorBasePrice + transportFee);
    const totalPrice = totalAmount;

    return {
      currency: 'BRL',
      creatorBasePrice: this.roundToTwoDecimals(params.creatorBasePrice),
      distanceKm: this.roundToTwoDecimals(params.distanceKm),
      transportFee,
      transport,
      platformFee,
      platformFeeRate: rate,
      totalPrice,
      totalAmount,
      transportPricePerKmUsed: this.roundToTwoDecimals(params.transportPricePerKm),
      transportMinimumFeeUsed: this.roundToTwoDecimals(params.transportMinimumFee),
    };
  }

  private roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
