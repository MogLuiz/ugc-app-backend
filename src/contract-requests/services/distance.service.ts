import { Injectable } from '@nestjs/common';

type Coordinates = {
  lat: number;
  lng: number;
};

export type DistanceSummary = {
  km: number | null;
  formatted: string | null;
  isWithinServiceRadius: boolean | null;
  effectiveServiceRadiusKm: number | null;
};

@Injectable()
export class DistanceService {
  calculateDistanceKm(origin: Coordinates, destination: Coordinates): number {
    const earthRadiusKm = 6371;
    const latDistance = this.toRadians(destination.lat - origin.lat);
    const lngDistance = this.toRadians(destination.lng - origin.lng);

    const a =
      Math.sin(latDistance / 2) * Math.sin(latDistance / 2) +
      Math.cos(this.toRadians(origin.lat)) *
        Math.cos(this.toRadians(destination.lat)) *
        Math.sin(lngDistance / 2) *
        Math.sin(lngDistance / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return this.roundToTwoDecimals(earthRadiusKm * c);
  }

  formatDistanceKm(distanceKm: number | null): string | null {
    if (distanceKm == null) return null;
    return `${distanceKm.toFixed(1)} km`;
  }

  buildSummary(distanceKm: number | null, effectiveServiceRadiusKm?: number | null): DistanceSummary {
    return {
      km: distanceKm,
      formatted: this.formatDistanceKm(distanceKm),
      isWithinServiceRadius:
        distanceKm == null || effectiveServiceRadiusKm == null
          ? null
          : distanceKm <= effectiveServiceRadiusKm,
      effectiveServiceRadiusKm: effectiveServiceRadiusKm ?? null,
    };
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }

  private roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
