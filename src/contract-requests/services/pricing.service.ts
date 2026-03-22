import { Injectable } from '@nestjs/common';
import { TransportQuote, TransportService } from './transport.service';

export type PricingBreakdown = {
  currency: 'BRL';
  creatorBasePrice: number;
  distanceKm: number;
  transportFee: number;
  transport: TransportQuote;
  platformFee: number;
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

    const transportFee = transport.price;
    const platformFee = 0;
    const totalAmount = this.roundToTwoDecimals(
      params.creatorBasePrice + transportFee + platformFee,
    );
    const totalPrice = totalAmount;

    return {
      currency: 'BRL',
      creatorBasePrice: this.roundToTwoDecimals(params.creatorBasePrice),
      distanceKm: this.roundToTwoDecimals(params.distanceKm),
      transportFee,
      transport,
      platformFee,
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
