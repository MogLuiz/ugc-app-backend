import { Injectable } from '@nestjs/common';

export type PricingBreakdown = {
  currency: 'BRL';
  creatorBasePrice: number;
  distanceKm: number;
  transportFee: number;
  platformFee: number;
  totalPrice: number;
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
  buildPricing(params: BuildPricingParams): PricingBreakdown {
    const transportFee = this.roundToTwoDecimals(
      Math.max(
        params.distanceKm * params.transportPricePerKm,
        params.transportMinimumFee,
      ),
    );
    const platformFee = 0;
    const totalPrice = this.roundToTwoDecimals(
      params.creatorBasePrice + transportFee + platformFee,
    );

    return {
      currency: 'BRL',
      creatorBasePrice: this.roundToTwoDecimals(params.creatorBasePrice),
      distanceKm: this.roundToTwoDecimals(params.distanceKm),
      transportFee,
      platformFee,
      totalPrice,
      transportPricePerKmUsed: this.roundToTwoDecimals(params.transportPricePerKm),
      transportMinimumFeeUsed: this.roundToTwoDecimals(params.transportMinimumFee),
    };
  }

  private roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
