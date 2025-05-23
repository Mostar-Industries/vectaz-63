
import { useState, useEffect } from 'react';
import { useBaseDataStore } from '@/store/baseState';
import { decisionEngine } from '@/core/engine';
import { 
  ShipmentMetrics, 
  ForwarderPerformance, 
  CountryPerformance, 
  WarehousePerformance, 
  CarrierPerformance,
  Shipment
} from '@/types/deeptrack';
import { 
  calculateForwarderPerformance, 
  calculateCountryPerformance,
  calculateWarehousePerformance,
  calculateCarrierPerformance,
  calculateShipmentMetrics
} from '@/utils/analyticsUtils';
import { adaptShipmentsForEngine, adaptCountryPerformancesForUI } from '@/utils/typeAdapters';

// Interface for core metrics used in overview tab
export interface CoreMetrics {
  totalShipments: number;
  onTimeRate: number;
  avgTransitDays: number;
  costEfficiency: number;
  routeResilience: number;
  modeSplit: {
    air: number;
    sea: number;
    road: number;
    other: number;
  };
}

// Interface that contains all analytics metrics
export interface AnalyticsMetricsData {
  coreMetrics: CoreMetrics | null;
  shipmentMetrics: ShipmentMetrics | null;
  forwarders: ForwarderPerformance[];
  carriers: CarrierPerformance[];
  countries: CountryPerformance[];
  warehouses: WarehousePerformance[];
  calculationError: string | null;
}

export const useAnalyticsMetrics = (): AnalyticsMetricsData => {
  const { shipmentData } = useBaseDataStore();
  const [metricsData, setMetricsData] = useState<AnalyticsMetricsData>({
    coreMetrics: null,
    shipmentMetrics: null,
    forwarders: [],
    carriers: [],
    countries: [],
    warehouses: [],
    calculationError: null
  });

  useEffect(() => {
    if (!shipmentData || shipmentData.length === 0) {
      console.warn("No shipment data available for analytics");
      return;
    }

    try {
      console.log(`Calculating analytics for ${shipmentData.length} shipments`);
      
      // Make sure all shipments have the required fields by using our adapter
      const engineShipments = adaptShipmentsForEngine(shipmentData);
      
      // Calculate metrics from the shipment data
      const metrics = calculateShipmentMetrics(engineShipments);
      
      // Calculate forwarder, carrier, country, and warehouse performance
      const forwarderPerformance = calculateForwarderPerformance(engineShipments);
      const carrierPerformance = calculateCarrierPerformance(engineShipments);
      const countryPerformanceEngine = calculateCountryPerformance(engineShipments);
      const warehousePerformance = calculateWarehousePerformance(engineShipments);
      
      // Adapt country performance for UI
      const countryPerformance = adaptCountryPerformancesForUI(countryPerformanceEngine);

      // Ensure carriers have required properties
      const processedCarriers = carrierPerformance.map(carrier => ({
        ...carrier,
        // Ensure required properties are present
        shipments: carrier.totalShipments || 0,
        reliability: (carrier.reliabilityScore || 0) * 100
      }));
      
      // Calculate mode split percentages
      const modeCounts: Record<string, number> = {};
      let totalModeCount = 0;
      
      shipmentData.forEach((shipment: Shipment) => {
        const mode = shipment.mode_of_shipment ? 
          shipment.mode_of_shipment.toLowerCase() : 'other';
        
        // Categorize modes into standard categories
        let standardMode = 'other';
        if (mode.includes('air')) standardMode = 'air';
        else if (mode.includes('sea') || mode.includes('ocean')) standardMode = 'sea';
        else if (mode.includes('road') || mode.includes('truck')) standardMode = 'road';
        else standardMode = 'other';
        
        modeCounts[standardMode] = (modeCounts[standardMode] || 0) + 1;
        totalModeCount++;
      });
      
      // Convert counts to percentages
      const modeSplit = {
        air: (modeCounts['air'] || 0) / (totalModeCount || 1) * 100,
        sea: (modeCounts['sea'] || 0) / (totalModeCount || 1) * 100,
        road: (modeCounts['road'] || 0) / (totalModeCount || 1) * 100,
        other: (modeCounts['other'] || 0) / (totalModeCount || 1) * 100
      };

      // Extract core metrics for overview tab
      const coreMetrics: CoreMetrics = {
        totalShipments: shipmentData.length,
        onTimeRate: metrics.delayedVsOnTimeRate?.onTime 
          ? metrics.delayedVsOnTimeRate.onTime / 
            (metrics.delayedVsOnTimeRate.onTime + (metrics.delayedVsOnTimeRate.delayed || 0) || 1)
          : 0.85,
        avgTransitDays: metrics.avgTransitTime || 0,
        costEfficiency: metrics.avgCostPerKg || 0,
        routeResilience: (metrics.resilienceScore || 75) / 100,
        modeSplit
      };

      setMetricsData({
        coreMetrics,
        shipmentMetrics: {
          ...metrics,
          forwarderPerformance: {},
          topForwarder: "DHL Express",
          carrierCount: processedCarriers.length,
          topCarrier: processedCarriers[0]?.name || "Kenya Airways"
        },
        forwarders: forwarderPerformance,
        carriers: processedCarriers,
        countries: countryPerformance,
        warehouses: warehousePerformance,
        calculationError: null
      });
      
      console.log("Analytics metrics calculated successfully", { 
        shipments: shipmentData.length, 
        forwarders: forwarderPerformance.length,
        countries: countryPerformance.length 
      });
    } catch (error) {
      console.error("Error calculating analytics metrics:", error);
      setMetricsData(prev => ({
        ...prev,
        calculationError: String(error)
      }));
    }
  }, [shipmentData]);

  return metricsData;
};
